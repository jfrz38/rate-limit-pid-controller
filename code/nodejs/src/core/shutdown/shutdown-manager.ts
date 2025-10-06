import { Scheduler } from "../../application/scheduler";

export class ShutdownManager {
    constructor(private readonly scheduler: Scheduler) { }

    shutdown(): void {
        this.scheduler.terminate();
        process.exit(0);
    }
}
