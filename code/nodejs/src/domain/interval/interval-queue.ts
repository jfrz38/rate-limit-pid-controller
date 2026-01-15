import { Event } from "../events";
import { Request } from "../request";
import { RequestInterval } from "./request-interval";

export class IntervalQueue {
    private readonly queue: Request[] = [];

    constructor(
        private readonly requestInterval: RequestInterval,
        private readonly maxRequests: number
    ) { }

    public add(request: Request): void {
        if (this.queue.length >= this.maxRequests) {
            this.queue.shift();
        }
        this.queue.push(request);
    }

    public getCompletedRequests(): Request[] {
        return this.queue.filter((request: Request) => {
            const time = request.getEventByType(Event.COMPLETED);
            if (!time) { return false; }
            return this.requestInterval.isTimeInInterval(time);
        });
    }

    public getLatencies(): number[] {
        return this.getSuccessfulRequests().map((request) => {
            const launched = request.getEventByType(Event.LAUNCHED)!;
            const completed = request.getEventByType(Event.COMPLETED)!;
            return completed - launched;
        });
    }


    private getSuccessfulRequests(): Request[] {
        return this.queue.filter(
            (request: Request) =>
                request.hasEventCompletedAndLaunched() &&
                this.requestInterval.isTimeInInterval(request.getEventByType(Event.LAUNCHED)!)
        );
    }

    public getLaunchedRequests(): Request[] {
        return this.queue.filter((request: Request) => {
            const time = request.getEventByType(Event.LAUNCHED);
            if (!time) {return false;}
            return this.requestInterval.isTimeInInterval(time);
        });
    }

    public getPriorities(): number[] {
        return this.queue.map((request) => request.priority);
    }
}
