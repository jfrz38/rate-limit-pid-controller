import { getLogger } from "../core/logging/logger";
import { Event } from "../domain/events";
import { PriorityQueue } from '../domain/priority-queue/priority-queue';
import { Request } from "../domain/request";
import { Executor } from "./executor";

export class Scheduler {
    private _maxConcurrentRequests: number;
    private _processingRequests: number = 0;

    private logger = getLogger();

    constructor(
        private readonly queue: PriorityQueue,
        private readonly executor: Executor
    ) {
        this._maxConcurrentRequests = executor.concurrency;
    }

    start() {
        this.queue.on('requestAdded', () => this.schedule());
        this.schedule();
    }

    private schedule() {
        while (this.canProcess()) {
            const request = this.queue.poll();
            if (!request) break;

            this.processRequest(request);
        }
    }

    private canProcess(): boolean {
        return (
            this.queue.length > 0 &&
            this._processingRequests < this._maxConcurrentRequests
        );
    }

    private processRequest(request: Request) {
        this._processingRequests++;
        request.status = Event.LAUNCHED;

        this.executor.add(async () => {
            try {
                await request.task();
                request.status = Event.COMPLETED;
                this.logger.info(`Completed request with priority ${request.priority}`)
            } catch (error) {
                request.status = Event.FAILED;
                this.logger.error(`Error processing request ${error}`);
            } finally {
                this._processingRequests--;
                setImmediate(() => this.schedule());
            }
        });
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

    terminate() {
        this.queue.removeAllListeners('requestAdded');
    }
}
