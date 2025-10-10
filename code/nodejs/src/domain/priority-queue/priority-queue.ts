import { Statistics } from '../../application/statistics';
import { getLogger } from '../../core/logging/logger';
import { intervalManager } from '../../core/shutdown/interval-manager';
import { Event } from '../events';
import { NotEnoughStatsException } from '../exceptions/not-enough-stats.exception';
import { Request } from "../request";
import { Heap } from './heap';

export class PriorityQueue {
    private queueTimeout: number = 100;
    private lastTimeEmpty = Date.now();

    _entryRequests: number = 0;
    _exitRequests: number = 0;

    _length: number = 0;

    private logger = getLogger();

    constructor(
        private readonly statistics: Statistics,
        private readonly queue: Heap<Request>
    ) {
        this.initializeUpdateQueueTimeout();
    }

    add(request: Request): void {
        this.queue.push(request);
        this._entryRequests++;
        this.scheduleTimeoutRemoval(request);
    }

    poll(): Request | null {
        if (this.queue.length === 0) {
            return null;
        }
        const request: Request = this.queue.poll()!;
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
                this.queue.remove(request);
                request.status = Event.EVICTED;
                if (this.queue.length === 0) {
                    this.lastTimeEmpty = Date.now();
                }
            }
        }, this.queueTimeout);
    }

    private initializeUpdateQueueTimeout() {
        const id = setInterval(() => this.updateQueueTimeout(), 1000);
        intervalManager.add(id);
    }

    private updateQueueTimeout() {
        try {
            const avgProcessingTime = this.statistics.getAverageProcessingTime();
            const newTimeout = Math.round(avgProcessingTime * 0.33);

            if (newTimeout !== this.queueTimeout) {
                this.logger.info(`Updating timeout from ${this.queueTimeout} to ${newTimeout}`);
                this.queueTimeout = newTimeout;
            }
        } catch (e: any) {
            if (e instanceof NotEnoughStatsException) {
                this.logger.info('Not enough stats to update timeout');
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
        return this.queue.isEmpty();
    }

    get length(): number {
        return this.queue.length;
    }
}
