import { getLogger } from "../../core/logging/logger";
import { intervalManager } from "../../core/shutdown/interval-manager";
import { NotEnoughStatsException } from "../exceptions/not-enough-stats.exception";
import { Request } from "../request";
import { Statistics } from "../statistics/statistics";
import { Timeout } from "../types/timeout";

export class TimeoutHandler {

    private logger = getLogger();
    private _timeout: number;
    private ratio: number;

    constructor(
        private readonly statistics: Statistics,
        parameters: Timeout
    ) {
        this._timeout = parameters.priorityQueue.value;
        this.ratio = parameters.priorityQueue.ratio;

        this.initializeUpdateQueueTimeout();
    }

    get timeout(): number {
        return this._timeout;
    }

    public isExpired(request: Request): boolean {
        return (Date.now() - request.createdAt) > this.timeout;
    }

    private initializeUpdateQueueTimeout() {
        const id = setInterval(() => this.updateQueueTimeout(), 1000);
        intervalManager.add(id);
    }

    private updateQueueTimeout() {
        try {
            const avgProcessingTime = this.statistics.getAverageProcessingTime();
            const newTimeout = Math.round(avgProcessingTime * this.ratio);

            if (newTimeout !== this._timeout) {
                this.logger.info(`Updating timeout from ${this._timeout} to ${newTimeout}`);
                this._timeout = newTimeout;
            }
        } catch (e: any) {
            if (e instanceof NotEnoughStatsException) {
                this.logger.info('Not enough stats to update timeout');
            } else {
                throw e;
            }
        }
    }
}
