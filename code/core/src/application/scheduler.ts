import { getLogger } from "../core/logging/logger";
import { Event } from "../domain/events";
import { PriorityQueue } from '../domain/priority-queue/priority-queue';
import { Request } from "../domain/request";
import { Executor } from "./executor";
import { Statistics } from "../domain/statistics/statistics";
import { ControllerShutdownException } from "../domain/exceptions/controller-shutdown.exception";

export class Scheduler {
    private _maxConcurrentRequests: number;
    private _processingRequests: number = 0;
    private _maxObservedConcurrentRequests: number = 0;
    private running = false;
    private readonly onRequestAdded = () => this.schedule();

    private logger = getLogger();

    constructor(
        private readonly queue: PriorityQueue,
        private readonly executor: Executor,
        private readonly statistics?: Statistics,
    ) {
        this._maxConcurrentRequests = executor.concurrency;
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.queue.on('requestAdded', this.onRequestAdded);
        this.schedule();
    }

    private schedule() {
        while (this.canProcess()) {
            const request = this.queue.poll();
            if (!request) {
                break;
            }

            this.processRequest(request);
        }
    }

    private canProcess(): boolean {
        return (
            this.queue.length > 0 &&
            this.running && this._processingRequests < this._maxConcurrentRequests
        );
    }

    private processRequest(request: Request) {
        this._processingRequests++;
        this._maxObservedConcurrentRequests = Math.max(this._maxObservedConcurrentRequests, this._processingRequests);
        request.transitionTo(Event.LAUNCHED);

        try {
            this.executor.add(async () => {
                try {
                    const result = await request.task();
                    request.transitionTo(Event.COMPLETED);
                    this.statistics?.recordSuccessful(request);
                    request.resolve?.(result);
                    this.logger.info(`Completed request ${request.id}: Priority ${request.priority}`);
                } catch (error) {
                    request.transitionTo(Event.FAILED);
                    request.reject?.(error);
                    this.logger.error(`Error processing request ${error}`);
                } finally {
                    this.releaseProcessingSlot();
                }
            });
        } catch (error) {
            request.transitionTo(Event.FAILED);
            request.reject?.(error);
            this.logger.error(`Error submitting request ${error}`);
            this.releaseProcessingSlot();
        }
    }

    private releaseProcessingSlot() {
        this._processingRequests--;
        if (this.running) {
            setImmediate(() => this.schedule());
        }
    }

    updateMaxConcurrentRequests(max: number) {
        this._maxConcurrentRequests = max;
        this.executor.concurrency = max;
        this.logger.info(`Max concurrent requests updated to: ${max}`);
        this.schedule();
    }

    get maxConcurrentRequests(): number {
        return this._maxConcurrentRequests;
    }

    get processingRequests(): number {
        return this._processingRequests;
    }

    consumeMaxObservedConcurrentRequests(): number {
        const observed = this._maxObservedConcurrentRequests;
        this._maxObservedConcurrentRequests = this._processingRequests;
        return observed;
    }

    terminate(reason: Error = new ControllerShutdownException()) {
        this.running = false;
        this.queue.off('requestAdded', this.onRequestAdded);
        this.queue.cancelAll(reason);
    }
}
