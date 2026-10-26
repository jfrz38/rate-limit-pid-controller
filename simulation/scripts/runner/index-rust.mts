import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  AdaptiveAdmissionController,
  ControllerShutdownError,
  EvictedRequestError,
  Priority,
  RejectedRequestError,
  ThresholdRejectedError,
} from '../../../code/hosts/node/dist/index.js';
import type {
  ControllerDiagnosticEvent,
  ControllerDiagnostics,
} from '../../../code/hosts/node/dist/index.js';

import { parseScenario, type ScenarioRequest } from './scenario.ts';

interface ScenarioOutcome {
  submitted: number;
  completed: number;
  rejected: number;
  evicted: number;
  failed: number;
}

interface DispatchLagSummary {
  samples: number;
  delayedRequests: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

const DISPATCH_BATCH_SIZE = 100;
const MAX_P95_DISPATCH_LAG_MS = 50;
const MAX_DISPATCH_LAG_MS = 500;

class DispatchLagMetrics {
  private readonly lags: number[] = [];

  record(scheduledArrivalMs: number, actualArrivalMs: number): number {
    const lag = Math.max(0, actualArrivalMs - scheduledArrivalMs);
    this.lags.push(lag);
    return lag;
  }

  summarize(): DispatchLagSummary {
    if (this.lags.length === 0) {
      return { samples: 0, delayedRequests: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
    }
    const sorted = [...this.lags].sort((left, right) => left - right);
    return {
      samples: sorted.length,
      delayedRequests: sorted.filter((lag) => lag > 1).length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.at(-1) ?? 0,
    };
  }
}

function percentile(values: number[], percentileValue: number): number {
  return values[Math.floor((values.length - 1) * percentileValue)];
}

class RunRustScenario {
  private readonly scenariosDirectory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../scenarios/generated',
  );
  private readonly controller = new AdaptiveAdmissionController({
    maxConcurrentRequests: 2,
    pid: { intervalMs: 1_000 },
  });
  private readonly pendingRequests: Promise<unknown>[] = [];
  private readonly dispatchLag = new DispatchLagMetrics();
  private readonly outcome: ScenarioOutcome = {
    submitted: 0,
    completed: 0,
    rejected: 0,
    evicted: 0,
    failed: 0,
  };
  private activeRequests = 0;
  private maxObservedConcurrency = 0;
  private previousDiagnostics: ControllerDiagnostics | undefined;

  constructor() {
    this.controller.onDiagnostic((event) => this.logDiagnostic(event));
  }

  async run(scenarioFile: string): Promise<void> {
    try {
      const filePath = path.join(this.scenariosDirectory, scenarioFile);
      const requests = parseScenario(fs.readFileSync(filePath, 'utf8'));
      if (requests.length === 0) {
        throw new Error(`Scenario ${scenarioFile} contains no requests`);
      }
      const startedAt = performance.now();

      this.log('CONTROLLER_INIT', 'Rust/Wasm controller is active', {
        capacity: { maxConcurrentRequests: 2 },
        timeout: { priorityQueue: { value: 500 } },
      });
      this.log('ADMISSION_THRESHOLD', 'Initial threshold: 768', {}, { threshold: 768 });
      this.log('SCENARIO_START', `Running scenario with Rust/Wasm: ${requests[0].scenario}`, {
        backend: 'rust-wasm',
        scenario: requests[0].scenario,
        seed: requests[0].seed,
        requests: requests.length,
        durationMs: requests[requests.length - 1].arrivalTimeMs,
      });

      let currentPhase: string | undefined;
      let nextRequestIndex = 0;
      while (nextRequestIndex < requests.length) {
        const elapsedMs = performance.now() - startedAt;
        const request = requests[nextRequestIndex];
        const delayMs = Math.max(0, request.arrivalTimeMs - elapsedMs);
        if (delayMs > 0) {
          await this.sleep(delayMs);
          continue;
        }

        let dispatched = 0;
        while (nextRequestIndex < requests.length
          && requests[nextRequestIndex].arrivalTimeMs <= performance.now() - startedAt) {
          const dueRequest = requests[nextRequestIndex];
          const actualArrivalTimeMs = performance.now() - startedAt;
          const dispatchLagMs = this.dispatchLag.record(dueRequest.arrivalTimeMs, actualArrivalTimeMs);
          if (dueRequest.phase !== currentPhase) {
            currentPhase = dueRequest.phase;
            this.log('PHASE_START', `Phase started: ${currentPhase}`, {
              phase: currentPhase,
              scheduledArrivalTimeMs: dueRequest.arrivalTimeMs,
              actualArrivalTimeMs,
              dispatchLagMs,
            });
          }
          this.submit(dueRequest);
          nextRequestIndex++;
          dispatched++;
          if (dispatched === DISPATCH_BATCH_SIZE) {
            await new Promise<void>((resolve) => setImmediate(resolve));
            break;
          }
        }
      }

      await Promise.allSettled(this.pendingRequests);
      const dispatchLag = this.dispatchLag.summarize();
      this.log('SCENARIO_SUMMARY', 'Rust/Wasm scenario completed', {
        backend: 'rust-wasm',
        ...this.outcome,
        durationMs: performance.now() - startedAt,
        maxObservedConcurrency: this.maxObservedConcurrency,
        dispatchLag,
      });
      if (dispatchLag.p95Ms > MAX_P95_DISPATCH_LAG_MS || dispatchLag.maxMs > MAX_DISPATCH_LAG_MS) {
        this.log('SCENARIO_DISPATCH_LAG', 'Scenario dispatch lag exceeds the execution budget', {
          ...dispatchLag,
          p95BudgetMs: MAX_P95_DISPATCH_LAG_MS,
          maxBudgetMs: MAX_DISPATCH_LAG_MS,
        });
      }
    } finally {
      this.controller.shutdown();
    }
  }

  private submit(request: ScenarioRequest): void {
    this.outcome.submitted++;
    const pending = this.controller
      .run(this.createRequest(request.executionTimeMs), Priority.fromValue(request.priorityValue))
      .then(() => {
        this.outcome.completed++;
        this.log('REQUEST_COMPLETED', `Completed request ${request.requestId}: Priority ${request.priorityValue}`, {
          requestId: request.requestId,
          priority: request.priorityValue,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ControllerShutdownError) return;
        if (error instanceof EvictedRequestError) {
          this.outcome.evicted++;
          this.log('REQUEST_EVICTED', `Evicted request ${request.requestId}: Priority ${request.priorityValue}`, {
            requestId: request.requestId,
            priority: request.priorityValue,
          });
          return;
        }
        if (error instanceof RejectedRequestError) {
          this.outcome.rejected++;
          const threshold = error instanceof ThresholdRejectedError ? error.threshold : undefined;
          this.log('REQUEST_REJECTED', `Rejected request ${request.requestId}: Priority ${request.priorityValue}`, {
            requestId: request.requestId,
            priority: request.priorityValue,
            ...(threshold === undefined ? {} : { threshold }),
          });
          return;
        }
        this.outcome.failed++;
        this.log('REQUEST_FAILED', `Request ${request.requestId} failed`, {
          requestId: request.requestId,
          priority: request.priorityValue,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    this.pendingRequests.push(pending);
  }

  private createRequest(latencyMs: number): () => Promise<void> {
    return async (): Promise<void> => {
      this.activeRequests++;
      this.maxObservedConcurrency = Math.max(this.maxObservedConcurrency, this.activeRequests);
      try {
        await this.sleep(latencyMs);
      } finally {
        this.activeRequests--;
      }
    };
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
  }

  private logDiagnostic(event: ControllerDiagnosticEvent): void {
    switch (event.type) {
      case 'threshold-changed':
        this.log(
          'ADMISSION_THRESHOLD',
          `Threshold modified from ${event.previous} to: ${event.current}`,
          { previous: event.previous, current: event.current },
          { threshold: event.current },
        );
        break;
      case 'concurrency-changed':
        this.log(
          'CONCURRENCY_LIMIT',
          `New inflightLimit: ${event.current}`,
          { previous: Number(event.previous), current: Number(event.current) },
          { inflightLimit: Number(event.current) },
        );
        break;
      case 'statistics-published': {
        const snapshot = event.snapshot;
        this.log('STATISTICS_SNAPSHOT', `Published statistics snapshot ${snapshot.id}`, {
          snapshotId: Number(snapshot.id),
        }, {
          percentileLatency: Number(snapshot.percentileLatencyMs),
          minimumLatency: Number(snapshot.minimumLatencyMs),
          averageLatency: snapshot.averageLatencyMs,
          throughputPerSecond: snapshot.throughputPerSecond,
          maxInFlight: Number(snapshot.maxInFlight),
        });
        break;
      }
      case 'controller-diagnostics': {
        const current = event.diagnostics;
        const previous = this.previousDiagnostics;
        if (previous?.queueTimeoutMs !== current.queueTimeoutMs) {
          this.log(
            'QUEUE_TIMEOUT',
            `Updating timeout from ${previous?.queueTimeoutMs ?? current.queueTimeoutMs} to ${current.queueTimeoutMs}`,
            { previous: previous?.queueTimeoutMs?.toString(), timeout: Number(current.queueTimeoutMs) },
            { timeout: Number(current.queueTimeoutMs) },
          );
        }
        if (previous?.targetLatencyMs !== current.targetLatencyMs) {
          this.log(
            'LATENCY_TARGET',
            `New targetLatency: ${current.targetLatencyMs}`,
            { previous: previous?.targetLatencyMs, targetLatency: current.targetLatencyMs },
            { targetLatency: current.targetLatencyMs },
          );
        }
        if (previous?.aggregatedLatencyMs !== current.aggregatedLatencyMs) {
          this.log(
            'LATENCY_AGGREGATED',
            `Filtered latency ${current.aggregatedLatencyMs ?? 'reset'}`,
            { aggregatedLatency: current.aggregatedLatencyMs ?? null },
            { aggregatedLatency: current.aggregatedLatencyMs ?? null },
          );
        }
        this.previousDiagnostics = current;
        break;
      }
    }
  }

  private log(
    event: string,
    msg: string,
    metadata: Record<string, unknown>,
    fields: Record<string, unknown> = {},
  ): void {
    console.log(JSON.stringify({ time: Date.now(), event, metadata, ...fields, msg }));
  }
}

const scenarioName = process.argv.slice(2).find((argument) => argument !== '--') || 'base';
const scenarioFile = scenarioName.endsWith('.csv') ? scenarioName : `${scenarioName}.csv`;
await new RunRustScenario().run(scenarioFile);
