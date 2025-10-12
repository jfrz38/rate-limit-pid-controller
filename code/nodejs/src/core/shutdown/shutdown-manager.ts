import { Scheduler } from "../../application/scheduler";
import { IntervalManager } from "./interval-manager";

export class ShutdownManager {
    constructor(
        private readonly scheduler: Scheduler,
        private readonly intervalManager: IntervalManager
    ) {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    shutdown(): void {
        this.scheduler.terminate();
        this.intervalManager.clearAll();
        process.exit(0);
    }
}
