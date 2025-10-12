import { Statistics } from '../../application/statistics';
import { getLogger } from '../../core/logging/logger';
import { intervalManager } from '../../core/shutdown/interval-manager';
import { Event } from '../events';
import { NotEnoughStatsException } from '../exceptions/not-enough-stats.exception';
import { Request } from "../request";
import { Heap } from './heap';

export class PriorityQueue {
    private lastTimeEmpty = Date.now();

    _entryRequests: number = 0;
    _exitRequests: number = 0;

    _length: number = 0;

    private logger = getLogger();

    constructor(
        private readonly statistics: Statistics,
        private readonly queue: Heap<Request>,
        private queueTimeout: number = 500
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
        this.setLastTimeEmpty();
        return request;
    }

    private scheduleTimeoutRemoval(request: Request) {
        setTimeout(() => {
            const index = this.queue.indexOf(request);
            if (index !== -1) {
                this.queue.remove(request);
                request.status = Event.EVICTED;
                this.logger.info(`Evicted request with priority ${request.priority}`)
                this.setLastTimeEmpty();
            }
        }, this.queueTimeout);
    }

    private initializeUpdateQueueTimeout() {
        // TODO: Todo esto de queue timeout puede ir a una clase inyectada
        const id = setInterval(() => this.updateQueueTimeout(), 1000);
        intervalManager.add(id);
    }

    private setLastTimeEmpty(): void {
        if (this.queue.isEmpty()) {
            this.lastTimeEmpty = Date.now();
        }
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
        if (this.isEmpty()) return 0;
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
