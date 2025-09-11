import { randomUUID, UUID } from "crypto";
import { Event } from "./events";

export class Request {
    private eventLog: Map<Event, Date> = new Map();

    readonly id: UUID;
    readonly task: Function;
    _status: Event

    private readonly RANDOM_COHORT = Math.floor(Math.random() * 128)

    constructor(task: Function, private readonly _priority: number, private readonly cohort: number = this.RANDOM_COHORT) {
        this.id = randomUUID();
        this.task = task;
        this.cohort = cohort;
        // TODO: Maybe this can be clearer
        this.status = this._status = Event.CREATED
    }

    get priority(): number {
        return this._priority * 128 + this.cohort;
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
