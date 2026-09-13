import { IntervalManager } from "../../core/shutdown/interval-manager";
import { ConcurrencyController } from "./concurrency.controller";
import { LatencyController } from "./latency.controller";

export class AutoTuner {
  constructor(
    private readonly concurrencyController: ConcurrencyController,
    private readonly latencyController: LatencyController,
    intervalManager: IntervalManager,
  ) {
    const concurrencyId = setInterval(() => this.concurrencyController.update(), 2000);
    const latencyId = setInterval(() => this.latencyController.update(), 10000);

    intervalManager.addAll([concurrencyId, latencyId]);
  }
}
