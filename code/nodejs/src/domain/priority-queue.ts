import { Statistics } from '../application/statistics';
import { NotEnoughStatsException } from './exceptions/not-enough-stats.exception';
import { Request } from "./request";
import { Event } from './events';

export class PriorityQueue {
    private queue: Request[] = [];

    private queueTimeout: number = 100;
    private lastTimeEmpty = Date.now();

    _entryRequests: number = 0;
    _exitRequests: number = 0;

    _length: number = 0;

    constructor(private readonly statistics: Statistics) {
        this.initializeUpdateQueueTimeout();
    }

    add(request: Request): void {
        this.queue.push(request);
        // TODO: Mirar si ordenar así o buscar una librería priority queue o 
        // TODO: hacerlo de otra manera más eficiente
        this.queue.sort((a, b) => a.priority - b.priority);
        this._entryRequests++;
        this.scheduleTimeoutRemoval(request);
    }

    poll(): Request | null {
        if (this.queue.length === 0) {
            return null;
        }
        const request: Request = this.queue.shift()!;
        this._exitRequests++;
        if (this.queue.length === 0) {
            this.lastTimeEmpty = Date.now();
        }
        return request;
    }

    private scheduleTimeoutRemoval(request: Request) {
        setTimeout(() => {
            const index = this.queue.indexOf(request);
            if (index !== -1) {
                this.queue.splice(index, 1);
                request.status = Event.EVICTED;
                if (this.queue.length === 0) this.lastTimeEmpty = Date.now();
            }
        }, this.queueTimeout);
    }

    private initializeUpdateQueueTimeout() {
        setInterval(() => this.updateQueueTimeout(), 1000);
    }

    private updateQueueTimeout() {
        try {
            const avgProcessingTime = this.statistics.getAverageProcessingTime();
            const newTimeout = Math.round(avgProcessingTime * 0.33);

            if (newTimeout !== this.queueTimeout) {
                console.info(
                    `Updating timeout from ${this.queueTimeout} to ${newTimeout}`
                );
                this.queueTimeout = newTimeout;
            }
        } catch (e: any) {
            if (e instanceof NotEnoughStatsException) {
                console.info('Not enough stats to update timeout');
            } else {
                throw e;
            }
        }
    }

    getTimeSinceLastEmpty(): number {
        return (Date.now() - this.lastTimeEmpty) / 1000;
    }

    get entryRequests(): number {
        return this._entryRequests;
    }

    get exitRequests(): number {
        return this._exitRequests;
    }

    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    get length(): number {
        return this.queue.length;
    }
}
