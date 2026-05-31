import { Scheduler } from "../../application/scheduler";
import { IntervalManager } from "./interval-manager";

export class ShutdownManager {
    private isShutdown = false;
    private readonly onSigint = () => this.shutdown();
    private readonly onSigterm = () => this.shutdown();

    constructor(
        private readonly scheduler: Scheduler,
        private readonly intervalManager: IntervalManager
    ) {
        process.on('SIGINT', this.onSigint);
        process.on('SIGTERM', this.onSigterm);
    }

    shutdown(): void {
        if (this.isShutdown) {
            return;
        }

        this.isShutdown = true;
        this.scheduler.terminate();
        this.intervalManager.clearAll();
        process.off('SIGINT', this.onSigint);
        process.off('SIGTERM', this.onSigterm);
    }
}
