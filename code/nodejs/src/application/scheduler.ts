import PQueue from 'p-queue';
import { Event } from "../domain/events";
import { PriorityQueue } from '../domain/priority-queue';
import { Request } from "../domain/request";

export class Scheduler {

    private maxConcurrentRequests;
    private readonly MAX_CONCURRENT_REQUESTS: number = 10;
    private processingRequests: number = 0;

    private queue: Request[] = [];
    private executor: PQueue;

    constructor(maxConcurrentRequests?: number) {
        this.maxConcurrentRequests = maxConcurrentRequests ?? this.MAX_CONCURRENT_REQUESTS
        this.executor = new PriorityQueue({ concurrency: this.maxConcurrentRequests });
    }

    start() {
        const loop = async () => {
            while (true) {
                try {
                    if (this.canProcess()) {
                        const request = this.queue.shift()!;
                        this.processingRequests++;
                        request.status = Event.LAUNCHED;

                        this.executor.add(async () => {
                            try {
                                await request.task();
                                request.status = Event.COMPLETED;
                            } catch (error) {
                                request.status = Event.FAILED;
                                console.error('Error processing request', error);
                            } finally {
                                this.processingRequests--;
                            }
                        });
                    } else {
                        await new Promise((res) => setTimeout(res, 10));
                    }
                } catch (e) {
                    console.error('Error processing request', e);
                }
            }
        };
        loop();
    }

    private canProcess() {
        return this.queue.length > 0 &&
            this.processingRequests < this.maxConcurrentRequests;
    }

    updateMaxConcurrentRequests(max: number) {
        this.maxConcurrentRequests = max;
        this.executor.concurrency = max;
        console.info('Max concurrent requests updated to:', max);
    }

    getMaxConcurrentRequests() {
        return this.maxConcurrentRequests;
    }

    getProcessingRequests() {
        return this.processingRequests;
    }
}
