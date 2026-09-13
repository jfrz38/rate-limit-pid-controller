import { randomUUID, UUID } from "crypto";
import { Event } from "./events";
import { Priority } from "./priority";

export type RequestTask<T = any> = () => T | Promise<T>;

export class Request<T = any> {
    private static readonly ALLOWED_TRANSITIONS: ReadonlyMap<Event, ReadonlySet<Event>> = new Map<Event, ReadonlySet<Event>>([
        [Event.CREATED, new Set([Event.QUEUED, Event.REJECTED])],
        [Event.QUEUED, new Set([Event.LAUNCHED, Event.EVICTED, Event.CANCELLED])],
        [Event.LAUNCHED, new Set([Event.COMPLETED, Event.FAILED])],
    ]);
    private eventLog: Map<Event, number> = new Map();
    private readonly _promise: Promise<T>;
    private resolvePromise!: (value: unknown) => void;
    private rejectPromise!: (reason?: unknown) => void;

    readonly id: UUID;
    readonly task: RequestTask<T>;
    private _status: Event;
    private _createdAt: number;


    constructor(task: RequestTask<T>, private readonly _priority: Priority) {
        this.id = randomUUID();
        this.task = task;
        this._promise = new Promise<T>((resolve, reject) => {
            this.resolvePromise = resolve as (value: unknown) => void;
            this.rejectPromise = reject;
        });
        this._promise.catch(() => undefined);
        this._createdAt = performance.now();
        this._status = Event.CREATED;
        this.eventLog.set(Event.CREATED, this._createdAt);
    }

    get status() {
        return this._status;
    }

    get priority(): number {
        return this._priority.value;
    }

    get createdAt(): number {
        return this._createdAt;
    }

    get promise(): Promise<T> {
        return this._promise;
    }

    resolve(value: T | PromiseLike<T>): void {
        this.resolvePromise(value);
    }

    reject(reason?: unknown): void {
        this.rejectPromise(reason);
    }

    transitionTo(newStatus: Event): void {
        if (!Request.ALLOWED_TRANSITIONS.get(this._status)?.has(newStatus)) {
            throw new Error(`Invalid request transition from ${Event[this._status]} to ${Event[newStatus]}`);
        }
        this._status = newStatus;
        this.eventLog.set(newStatus, performance.now());
    }

    hasEventCreatedAndCompleted(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.CREATED);
    }

    hasEventCompletedAndLaunched(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.LAUNCHED);
    }

    getEventTimestamp(event: Event): number | undefined {
        return this.eventLog.get(event);
    }
}
