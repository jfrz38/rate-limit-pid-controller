import { AutoTuner } from "./application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "./application/auto-tuner/concurrency.controller";
import { LatencyController } from "./application/auto-tuner/latency.controller";
import { Executor } from "./application/executor";
import { PidController } from "./application/pid-controller";
import { Rejector } from "./application/rejector";
import { Scheduler } from "./application/scheduler";
import { Statistics } from "./application/statistics";
import { intervalManager } from "./core/shutdown/interval-manager";
import { ShutdownManager } from "./core/shutdown/shutdown-manager";
import { Priority } from "./domain/priority";
import { RequestPriorityComparator } from "./domain/priority-queue/comparator";
import { Heap } from "./domain/priority-queue/heap";
import { PriorityQueue } from "./domain/priority-queue/priority-queue";
import { Request } from "./domain/request";

export class PidControllerRateLimit {

    private readonly rejector: Rejector;
    private readonly scheduler: Scheduler;
    private readonly statistics: Statistics;
    private readonly priorityQueue: PriorityQueue;
    private readonly pidController: PidController;
    private readonly executor: Executor;
    private readonly shutdownManager: ShutdownManager;

    constructor() {
        this.executor = new Executor();
        this.statistics = new Statistics();
        this.priorityQueue = new PriorityQueue(this.statistics, new Heap(RequestPriorityComparator.compare()));
        this.scheduler = new Scheduler(this.priorityQueue, this.executor);
        this.pidController = new PidController(this.scheduler, this.priorityQueue);
        this.rejector = new Rejector(this.priorityQueue, this.statistics, this.pidController);
        this.shutdownManager = new ShutdownManager(this.scheduler, intervalManager);

        this.init();
    }

    private init(): void {
        this.scheduler.start();
        const latencyController = new LatencyController(this.statistics);
        new AutoTuner(
            new ConcurrencyController(this.scheduler, this.statistics, latencyController),
            latencyController
        );
    }

    run(task: Function, priority: number): void {
        const request: Request = new Request(task, new Priority(priority));
        this.rejector.process(request);
        this.statistics.add(request);
    }

    shutdown(): void {
        this.shutdownManager.shutdown();
    }
}
