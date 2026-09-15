import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

import { PidControllerRateLimit } from '../../../code/core/src/pid-controller-rate-limit';
import { ControllerShutdownException } from '../../../code/core/src/domain/exceptions/controller-shutdown.exception';
import { EvictedRequestException } from '../../../code/core/src/domain/exceptions/evicted-request.exception';
import { RejectedRequestException } from '../../../code/core/src/domain/exceptions/rejected-request.exception';
import { Priority } from '../../../code/core/src/domain/priority';

export interface ScenarioRequest {
  requestId: number;
  scenario: string;
  seed: number;
  phase: string;
  arrivalTimeMs: number;
  executionTimeMs: number;
  priorityTier: number;
  priorityValue: number;
}

interface ScenarioOutcome {
  submitted: number;
  completed: number;
  rejected: number;
  evicted: number;
  failed: number;
}

export interface DispatchLagSummary {
  samples: number;
  delayedRequests: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

const DISPATCH_BATCH_SIZE = 100;
const MAX_P95_DISPATCH_LAG_MS = 50;
const MAX_DISPATCH_LAG_MS = 500;

export function dispatchDelayMs(targetTime: number, currentTime: number): number {
  return Math.max(0, targetTime - currentTime);
}

export class DispatchLagMetrics {
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

export function parseScenario(content: string): ScenarioRequest[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const headers = lines.shift()?.split(',') ?? [];
  const expectedHeaders = [
    'requestId',
    'scenario',
    'seed',
    'phase',
    'arrivalTimeMs',
    'executionTimeMs',
    'priorityTier',
    'priorityValue',
  ];

  if (headers.join(',') !== expectedHeaders.join(',')) {
    throw new Error(`Invalid scenario headers: ${headers.join(',')}`);
  }

  const requests = lines.map((line, index) => {
    const values = line.split(',');
    if (values.length !== expectedHeaders.length) {
      throw new Error(`Invalid column count at scenario row ${index + 2}`);
    }
    const request: ScenarioRequest = {
      requestId: Number(values[0]),
      scenario: values[1],
      seed: Number(values[2]),
      phase: values[3],
      arrivalTimeMs: Number(values[4]),
      executionTimeMs: Number(values[5]),
      priorityTier: Number(values[6]),
      priorityValue: Number(values[7]),
    };

    const numericValues = [
      request.requestId,
      request.seed,
      request.arrivalTimeMs,
      request.executionTimeMs,
      request.priorityTier,
      request.priorityValue,
    ];
    if (numericValues.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid numeric value at scenario row ${index + 2}`);
    }
    if (request.arrivalTimeMs < 0 || request.executionTimeMs < 0) {
      throw new Error(`Negative timing value at scenario row ${index + 2}`);
    }
    if (!Number.isInteger(request.requestId) || !Number.isInteger(request.seed)
      || !Number.isInteger(request.priorityTier) || !Number.isInteger(request.priorityValue)
      || request.priorityTier < 0 || request.priorityTier > 5
      || request.priorityValue < 0 || request.priorityValue > 767
      || Math.floor(request.priorityValue / 128) !== request.priorityTier) {
      throw new Error(`Invalid identity or priority at scenario row ${index + 2}`);
    }
    if (!request.scenario || !request.phase) {
      throw new Error(`Missing scenario or phase at scenario row ${index + 2}`);
    }

    return request;
  }).sort((left, right) => left.arrivalTimeMs - right.arrivalTimeMs);

  if (requests.some((request) => request.scenario !== requests[0].scenario || request.seed !== requests[0].seed)) {
    throw new Error('Scenario rows must use one scenario name and seed');
  }
  return requests;
}

export class RunScenario {
  private readonly scenariosDirectory = path.join(__dirname, '../../scenarios/generated');
  private readonly controller: PidControllerRateLimit;
  private readonly pendingRequests: Promise<unknown>[] = [];
  private readonly dispatchLag = new DispatchLagMetrics();
  private readonly outcome: ScenarioOutcome = {
    submitted: 0,
    completed: 0,
    rejected: 0,
    evicted: 0,
    failed: 0,
  };

  constructor() {
    this.controller = new PidControllerRateLimit({
      capacity: {
        maxConcurrentRequests: 2,
      },
      pid: {
        interval: 1000,
      },
      log: { level: 'debug' },
    });
  }

  async run(scenarios: string[]): Promise<void> {
    try {
      if (scenarios.length !== 1) {
        throw new Error('Exactly one scenario must be provided');
      }

      const scenarioFile = scenarios[0];
      const filePath = path.join(this.scenariosDirectory, scenarioFile);
      const requests = parseScenario(fs.readFileSync(filePath, 'utf-8'));
      if (requests.length === 0) {
        throw new Error(`Scenario ${scenarioFile} contains no requests`);
      }
      const startedAt = performance.now();

      this.log('SCENARIO_START', `Running scenario: ${requests[0].scenario}`, {
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
        const delayMs = dispatchDelayMs(request.arrivalTimeMs, elapsedMs);
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
            await this.yieldToEventLoop();
            break;
          }
        }
      }

      await Promise.allSettled(this.pendingRequests);
      const dispatchLag = this.dispatchLag.summarize();
      this.log('SCENARIO_SUMMARY', 'Scenario completed', {
        ...this.outcome,
        durationMs: performance.now() - startedAt,
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
      })
      .catch((error: unknown) => {
        if (error instanceof RejectedRequestException) {
          this.outcome.rejected++;
        } else if (error instanceof EvictedRequestException) {
          this.outcome.evicted++;
        } else if (!(error instanceof ControllerShutdownException)) {
          this.outcome.failed++;
        }
      });
    this.pendingRequests.push(pending);
  }

  private createRequest(latencyMs: number): () => Promise<void> {
    return async (): Promise<void> => {
      await this.sleep(latencyMs);
    };
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  private log(event: string, msg: string, metadata: Record<string, unknown>): void {
    console.log(JSON.stringify({ time: Date.now(), event, metadata, msg }));
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const scenarioName = args[0] || 'base';
  const scenarioFile = scenarioName.endsWith('.csv') ? scenarioName : `${scenarioName}.csv`;
  void new RunScenario().run([scenarioFile]);
}
