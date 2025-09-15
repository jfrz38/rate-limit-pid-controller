import { Scheduler } from "../scheduler";
import { Statistics } from "../statistics";
import { ConcurrencyController } from "./concurrency.controller";
import { LatencyController } from "./latency.controller";

// const CORES = require("os").cpus().length;

export class AutoTuner {
  constructor(
    private readonly concurrencyController: ConcurrencyController,
    private readonly latencyController: LatencyController
  ) {
    setInterval(() => this.concurrencyController.update(), 2000);
    setInterval(() => this.latencyController.update(), 10000);
  }
}
