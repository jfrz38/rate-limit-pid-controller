import { randomUUID, UUID } from "crypto";
import { Event } from "./events";
import { Priority } from "./priority";

export class Request {
    private eventLog: Map<Event, number> = new Map();

    readonly id: UUID;
    readonly task: Function;
    private _status: Event
    private _createdAt: number


    constructor(task: Function, private readonly _priority: Priority) {
        this.id = randomUUID();
        this.task = task;
        this.status = this._status = Event.CREATED
        this._createdAt = Date.now();
    }

    get status() {
        return this._status
    }

    get priority(): number {
        return this._priority.value;
    }

    get createdAt(): number {
        return this._createdAt;
    }

    set status(newStatus: Event) {
        this._status = newStatus;
        this.eventLog.set(newStatus, Date.now());

    }

    getEventLog(): Map<Event, number> {
        return this.eventLog;
    }

    hasEventCreatedAndCompleted(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.CREATED)
    }

    hasEventCompletedAndLaunched(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.LAUNCHED)
    }

    getEventByType(event: Event): number | undefined {
        return this.eventLog.get(event);
    }

}
