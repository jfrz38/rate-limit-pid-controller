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
    const startedAt = performance.now();
    try {
      if (scenarios.length !== 1) {
        throw new Error('Exactly one scenario must be provided');
      }

      for (const scenarioFile of scenarios) {
        const filePath = path.join(this.scenariosDirectory, scenarioFile);
        const requests = parseScenario(fs.readFileSync(filePath, 'utf-8'));
        if (requests.length === 0) {
          throw new Error(`Scenario ${scenarioFile} contains no requests`);
        }

        this.log('SCENARIO_START', `Running scenario: ${requests[0].scenario}`, {
          scenario: requests[0].scenario,
          seed: requests[0].seed,
          requests: requests.length,
          durationMs: requests[requests.length - 1].arrivalTimeMs,
        });

        let currentPhase: string | undefined;
        for (const request of requests) {
          await this.sleepUntil(startedAt + request.arrivalTimeMs);
          if (request.phase !== currentPhase) {
            currentPhase = request.phase;
            this.log('PHASE_START', `Phase started: ${currentPhase}`, {
              phase: currentPhase,
              arrivalTimeMs: request.arrivalTimeMs,
            });
          }
          this.submit(request);
        }
      }

      await Promise.allSettled(this.pendingRequests);
      this.log('SCENARIO_SUMMARY', 'Scenario completed', {
        ...this.outcome,
        durationMs: performance.now() - startedAt,
      });
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

  private async sleepUntil(targetTime: number): Promise<void> {
    await this.sleep(Math.max(0, targetTime - performance.now()));
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
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
