import { getLogger } from '../../core/logging/logger';
import { Event } from '../events';
import { Request } from "../request";
import { Heap } from './heap';
import { TimeoutHandler } from './timeout-handler';

export class PriorityQueue {
    private lastTimeEmpty = Date.now();

    _entryRequests: number = 0;
    _exitRequests: number = 0;

    private logger = getLogger();

    constructor(
        private readonly queue: Heap<Request>,
        private readonly timeoutHandler: TimeoutHandler
    ) { }

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
        }, this.timeoutHandler.timeout);
    }

    private setLastTimeEmpty(): void {
        if (this.queue.isEmpty()) {
            this.lastTimeEmpty = Date.now();
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
