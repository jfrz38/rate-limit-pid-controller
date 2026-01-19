import { AutoTuner } from "./application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "./application/auto-tuner/concurrency.controller";
import { ControllerHistory } from "./application/auto-tuner/controller-history";
import { LatencyController } from "./application/auto-tuner/latency.controller";
import { Executor } from "./application/executor";
import { PidController } from "./application/pid-controller";
import { Rejector } from "./application/rejector";
import { Scheduler } from "./application/scheduler";
import { getLogger, initLogger } from "./core/logging/logger";
import { intervalManager } from "./core/shutdown/interval-manager";
import { ShutdownManager } from "./core/shutdown/shutdown-manager";
import { DefaultOptions } from "./default-parameters";
import { IntervalQueue } from "./domain/interval/interval-queue";
import { RequestInterval } from "./domain/interval/request-interval";
import { Priority } from "./domain/priority";
import { RequestPriorityComparator } from "./domain/priority-queue/comparator";
import { Heap } from "./domain/priority-queue/heap";
import { PriorityQueue } from "./domain/priority-queue/priority-queue";
import { TimeoutHandler } from "./domain/priority-queue/timeout-handler";
import { Request } from "./domain/request";
import { Statistics } from "./domain/statistics/statistics";
import { Parameters, RequiredParameters } from "./domain/types/parameters";

export class PidControllerRateLimit {

    private readonly parameters: RequiredParameters;

    private readonly rejector: Rejector;
    private readonly scheduler: Scheduler;
    private readonly statistics: Statistics;
    private readonly priorityQueue: PriorityQueue;
    private readonly pidController: PidController;
    private readonly executor: Executor;
    private readonly shutdownManager: ShutdownManager;
    private readonly queueTimeout: TimeoutHandler;
    private readonly requestInterval: RequestInterval;
    private readonly intervalQueue: IntervalQueue;
    private readonly controllerHistory: ControllerHistory;

    constructor(options: Parameters = {}) {
        this.parameters = DefaultOptions.getRequiredOptions(options);

        initLogger(this.parameters.log.level);

        const { capacity, statistics, timeout, pid, threshold } = this.parameters;

        this.executor = new Executor(capacity.maxConcurrentRequests);
        this.requestInterval = new RequestInterval(statistics.requestInterval.minIntervalTime, statistics.requestInterval.maxIntervalTime);
        this.intervalQueue = new IntervalQueue(this.requestInterval, statistics.maxRequests);
        this.statistics = new Statistics(this.intervalQueue, statistics);
        this.queueTimeout = new TimeoutHandler(this.statistics, timeout);
        this.priorityQueue = new PriorityQueue(new Heap(RequestPriorityComparator.compare()), this.queueTimeout);
        this.scheduler = new Scheduler(this.priorityQueue, this.executor);
        this.pidController = new PidController(this.scheduler, this.priorityQueue, pid);
        this.rejector = new Rejector(this.priorityQueue, this.statistics, this.pidController, threshold?.initial, pid?.interval);
        this.controllerHistory = new ControllerHistory();
        this.shutdownManager = new ShutdownManager(this.scheduler, intervalManager);

        this.init();

        getLogger().info({
            event: 'CONTROLLER_INIT',
            metadata: this.parameters
        }, 'PID Controller is now active.');
    }

    private init(): void {
        this.scheduler.start();
        const latencyController = new LatencyController(this.statistics, this.controllerHistory);
        new AutoTuner(
            new ConcurrencyController(this.scheduler, this.statistics, latencyController, this.controllerHistory, this.parameters.capacity.cores),
            latencyController
        );
    }

    run(task: Function, priority: number | undefined): void {
        const request: Request = new Request(task, new Priority(priority));
        this.rejector.process(request);
    }

    shutdown(): void {
        this.shutdownManager.shutdown();
    }
}

