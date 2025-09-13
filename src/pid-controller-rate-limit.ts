import { PidController } from "./application/pid-controller";
import { Rejector } from "./application/rejector";
import { Scheduler } from "./application/scheduler";
import { Statistics } from "./application/statistics";
import { Priority } from "./domain/priority";
import { PriorityQueue } from "./domain/priority-queue";
import { Request } from "./domain/request";

// TODO: First approach, not all features from Cinnamon
export class PidControllerRateLimit {

    private readonly rejector: Rejector;
    private readonly scheduler: Scheduler;
    private readonly statistics: Statistics;
    private readonly priorityQueue: PriorityQueue;
    private readonly pidController: PidController;

    constructor() {
        this.statistics = new Statistics();
        this.priorityQueue = new PriorityQueue();
        this.scheduler = new Scheduler();
        this.pidController = new PidController(this.scheduler, this.priorityQueue);
        this.rejector = new Rejector(this.priorityQueue, this.statistics, this.pidController);

        this.init();
    }

    private init(): void {
        this.scheduler.start();
    }

    run(task: Function, priority: number): void {
        const request: Request = new Request(task, new Priority(priority));
        this.rejector.process(request);
        this.statistics.add(request);
    }
}
