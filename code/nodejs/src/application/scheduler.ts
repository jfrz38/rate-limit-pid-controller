import { Event } from "../domain/events";
import { PriorityQueue } from '../domain/priority-queue/priority-queue';
import { Request } from "../domain/request";
import { Executor } from "./executor";

export class Scheduler {
    private _maxConcurrentRequests: number;
    private _processingRequests: number = 0;

    constructor(
        private readonly queue: PriorityQueue,
        private readonly executor: Executor
    ) {
        this.start();
        this._maxConcurrentRequests = executor.concurrency;
    }

    start() {
        const loop = async () => {
            while (true) {
                try {
                    if (this.canProcess()) {
                        const request = this.queue.poll();
                        if (!request) {
                            continue;
                        }
                        this.processRequest(request);
                    } else {
                        await new Promise((res) => setTimeout(res, 10));
                    }
                } catch (error) {
                    console.error('Error processing request', error);
                }
            }
        };
        loop();
    }

    private canProcess() {
        return this.queue.length > 0 &&
            this._processingRequests < this._maxConcurrentRequests;
    }

    private processRequest(request: Request) {
        this._processingRequests++;
        request.status = Event.LAUNCHED;

        this.executor.add(async () => {
            try {
                await request.task();
                request.status = Event.COMPLETED;
            } catch (error) {
                request.status = Event.FAILED;
                console.error('Error processing request', error);
            } finally {
                this._processingRequests--;
            }
        });
    }

    updateMaxConcurrentRequests(max: number) {
        this._maxConcurrentRequests = max;
        this.executor.concurrency = max;
        console.info('Max concurrent requests updated to:', max);
    }

    get maxConcurrentRequests(): number {
        return this._maxConcurrentRequests;
    }

    get processingRequests(): number {
        return this._processingRequests;
    }
}
