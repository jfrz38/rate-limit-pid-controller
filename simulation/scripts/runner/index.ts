import fs from 'fs';
import path from 'path';
import { PidControllerRateLimit } from '../../../code/core/src/pid-controller-rate-limit';

export class RunScenario {
  private scenariosDirectory = path.join(__dirname, '../../scenarios/generated');
  private readonly controller: PidControllerRateLimit;

  constructor() {
    this.controller = new PidControllerRateLimit({
      capacity: {
        maxConcurrentRequests: 2
      },
      pid:{
        interval: 1000        
      },
      log: { level: 'debug' }
    });
  }

  async run(scenarios: string[]): Promise<void> {
    for (const scenario of scenarios) {
      console.log(`{"time": ${Date.now()}, "msg": "Running scenario: ${scenario}"}`);
      const filePath = path.join(this.scenariosDirectory, scenario);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').slice(1).filter(l => l.trim() !== '');

      const queue = [...lines];

      const workers = Array.from({ length: 32 }, (_, workerId) =>
        this.workerLoop(workerId, queue)
      );

      await Promise.all(workers);
    }

    this.controller.shutdown();
  }

  private async workerLoop(workerId: number, queue: string[]): Promise<void> {
    while (queue.length > 0) {
      const line = queue.shift();
      if (!line) break;

      const [_, priority, executionTime, sleepTime] = line.split(',').map(Number);

      try {
        this.controller.run(await this.createRequest(executionTime), priority);
      } catch (e) { }

      await this.sleep(sleepTime);
    }

    console.log(`{"time": ${Date.now()}, "worker": ${workerId}, "msg": "finished"}`);
  }

  private createRequest(latency: number): () => Promise<void> {
    return async function (): Promise<void> {
      await new Promise<void>((resolve) => setTimeout(resolve, latency * 1000));
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms * 1000));
  }
}

const args = process.argv.slice(2); 
const scenarioName = args[0] || "base";
const scenarioFile = scenarioName.endsWith('.csv') ? scenarioName : `${scenarioName}.csv`;

const scenarios = [scenarioFile]
new RunScenario().run(scenarios);
