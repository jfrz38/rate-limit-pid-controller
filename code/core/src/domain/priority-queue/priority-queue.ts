import { EventEmitter } from "events";
import { getLogger } from '../../core/logging/logger';
import { Event } from '../events';
import { Request } from "../request";
import { Heap } from './heap';
import { TimeoutHandler } from './timeout-handler';

export class PriorityQueue extends EventEmitter {
    private readonly timers = new Map<Request, NodeJS.Timeout>();

    private lastTimeEmpty = performance.now();

    private _entryRequests: number = 0;
    private _exitRequests: number = 0;

    private logger = getLogger();

    constructor(
        private readonly queue: Heap<Request>,
        private readonly timeoutHandler: TimeoutHandler
    ) {
        super();
    }

    public add(request: Request): void {
        this.queue.push(request);
        this._entryRequests++;
        this.scheduleTimeoutRemoval(request);
        this.emit('requestAdded');
    }

    public poll(): Request | null {
        while (this.queue.length > 0) {
            const request = this.queue.pop()!;

            this.clearTimer(request);

            this._exitRequests++;
            this.setLastTimeEmpty();
            return request;
        }
        return null;
    }

    public resetCounters(): void {
        this._entryRequests = 0;
        this._exitRequests = 0;
    }

    private scheduleTimeoutRemoval(request: Request) {
        const timerId = setTimeout(() => {
            const index = this.queue.indexOf(request);
            if (index !== -1) {
                this.queue.remove(request);
                request.status = Event.EVICTED;
                this.logger.info(`Evicted request with priority ${request.priority}`);
                this.setLastTimeEmpty();
            }
            this.timers.delete(request);
        }, this.timeoutHandler.timeout);

        this.timers.set(request, timerId);
    }

    private setLastTimeEmpty(): void {
        if (this.queue.isEmpty()) {
            this.lastTimeEmpty = performance.now();
        }
    }

    getTimeSinceLastEmpty(): number {
        if (this.queue.isEmpty()) {
            return 0;
        }
        return (performance.now() - this.lastTimeEmpty) / 1000;
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

    private clearTimer(request: Request): void {
        const timerId = this.timers.get(request);
        if (timerId) {
            clearTimeout(timerId);
            this.timers.delete(request);
        }
    }
}
