import { Request } from "../request";

export class RequestPriorityComparator {
    static compare(): (a: Request, b: Request) => number {
        return (a: Request, b: Request) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.createdAt - b.createdAt; 
        };
    }
}
