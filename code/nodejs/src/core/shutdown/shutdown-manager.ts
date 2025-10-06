import { Scheduler } from "../../application/scheduler";
import { IntervalManager } from "./interval-manager";

export class ShutdownManager {
    constructor(
        private readonly scheduler: Scheduler,
        private readonly intervalManager: IntervalManager
    ) { }

    shutdown(): void {
        this.scheduler.terminate();
        this.intervalManager.clearAll();
    }
}

