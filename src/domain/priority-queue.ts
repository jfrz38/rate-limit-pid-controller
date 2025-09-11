import PQueue from 'p-queue';
import { RunFunction } from "p-queue/dist/queue";
import { Request } from "./request";

export class PriorityQueue extends PQueue {
    entryRequests: number = 0;
    exitRequests: number = 0;

    private lastTimeEmpty = Date.now();

    addRequest(request: Request): void {
        this.entryRequests++;

        const run: RunFunction = async () => {
            await request.task();
            this.exitRequests++;
            if (this.size === 0) {
                this.lastTimeEmpty = Date.now();
            }
        };

        // TODO: Comprobar que la prioridad está bien y no es es al revés
        this.add(run, { priority: request.priority });
    }

    getTimeSinceLastEmpty(): number {
        return (Date.now() - this.lastTimeEmpty) / 1000;
    }
}
