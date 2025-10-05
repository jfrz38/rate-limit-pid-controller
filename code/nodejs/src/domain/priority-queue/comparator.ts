import { Request } from "../request"

export class RequestPriorityComparator {

    static compare(): (a: Request, b: Request) => number {
        return (a: Request, b: Request) => a.priority - b.priority;
    }
}
