import { randomUUID, UUID } from "crypto";
import { Event } from "./events";
import { Priority } from "./priority";

export class Request {
    private eventLog: Map<Event, Date> = new Map();

    readonly id: UUID;
    readonly task: Function;
    _status: Event


    constructor(task: Function, private readonly _priority: Priority) {
        this.id = randomUUID();
        this.task = task;
        // TODO: Maybe this can be clearer
        this.status = this._status = Event.CREATED
    }

    get priority(): number {
        return this._priority.value;
    }

    set status(newStatus: Event) {
        this._status = newStatus;
        this.eventLog.set(newStatus, new Date());

    }

    getEventLog(): Map<Event, Date> {
        return this.eventLog;
    }

    hasEventCreatedAndCompleted(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.CREATED)
    }

    hasEventCompletedAndLaunched(): boolean {
        return this.eventLog.has(Event.COMPLETED) && this.eventLog.has(Event.LAUNCHED)
    }

    getEventByType(event: Event): Date | undefined {
        return this.eventLog.get(event);
    }

}
