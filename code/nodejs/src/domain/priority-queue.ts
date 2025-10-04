import PQueue from 'p-queue';
import { RunFunction } from 'p-queue/dist/queue';
import { Request } from "./request";
import { Statistics } from '../application/statistics';
import { NotEnoughStatsException } from './exceptions/not-enough-stats.exception';

// TODO: Esta clase no me convence, no funciona bien
export class PriorityQueue extends PQueue {
    private queueTimeout: number = 100;
    private lastTimeEmpty = Date.now();
    
    entryRequests: number = 0;
    exitRequests: number = 0;

    constructor(private readonly statistics: Statistics) {
        super();
        this.initializeUpdateQueueTimeout();
    }

    addRequest(request: Request): void {
        this.entryRequests++;

        const run: RunFunction = async () => {
            // TODO: comprobar que no se ejecuta aquí sino en el scheduler
            await request.task();
            this.exitRequests++;
            // TODO : Check if is removed correctly
            if (this.size === 0) {
                this.lastTimeEmpty = Date.now();
            }
        };

        // TODO: Comprobar que la prioridad está bien y no es es al revés
        this.add(run, { priority: request.priority });
    }

    private initializeUpdateQueueTimeout() {
        setInterval(() => this.updateQueueTimeout(), 1000);
    }

    private updateQueueTimeout() {
        try {
            const avgProcessingTime = this.statistics.getAverageProcessingTime();
            const newTimeout = Math.round(avgProcessingTime * 0.33);

            if (newTimeout !== this.queueTimeout) {
                console.log(
                    `Updating timeout from ${this.queueTimeout} to ${newTimeout}`
                );
                this.queueTimeout = newTimeout;
            }
        } catch (e: any) {
            if (e instanceof NotEnoughStatsException) {
                console.log('Not enough stats to update timeout');
            } else {
                throw e;
            }
        }
    }

    getTimeSinceLastEmpty(): number {
        return (Date.now() - this.lastTimeEmpty) / 1000;
    }
}
