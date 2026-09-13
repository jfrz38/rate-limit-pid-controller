import { getLogger } from "../../core/logging/logger";
import { IntervalManager } from "../../core/shutdown/interval-manager";
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
        parameters: Timeout,
        private readonly intervalManager: IntervalManager,
    ) {
        this._timeout = parameters.priorityQueue.value;
        this.ratio = parameters.priorityQueue.ratio;

        this.initializeUpdateQueueTimeout();
    }

    get timeout(): number {
        return this._timeout;
    }


    private initializeUpdateQueueTimeout() {
        const id = setInterval(() => this.updateQueueTimeout(), 1000);
        this.intervalManager.add(id);
    }

    private updateQueueTimeout() {
        try {
            const avgProcessingTime = this.statistics.getAverageProcessingTime();
            const newTimeout = Math.round(avgProcessingTime * this.ratio);

            if (Number.isFinite(newTimeout) && newTimeout > 0 && newTimeout !== this._timeout) {
                const previousTimeout = this._timeout;
                this.logger.info({
                    event: 'QUEUE_TIMEOUT',
                    previousTimeout,
                    timeout: newTimeout,
                    averageProcessingTime: avgProcessingTime,
                }, `Updating timeout from ${previousTimeout} to ${newTimeout}`);
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
