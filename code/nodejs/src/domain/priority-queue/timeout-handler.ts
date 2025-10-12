import { Statistics } from "../../application/statistics";
import { getLogger } from "../../core/logging/logger";
import { intervalManager } from "../../core/shutdown/interval-manager";
import { NotEnoughStatsException } from "../exceptions/not-enough-stats.exception";

export class TimeoutHandler {

    private logger = getLogger();

    constructor(
        private readonly statistics: Statistics,
        private _timeout: number = 500,
        private ratio: number = 0.33
    ) {
        this.initializeUpdateQueueTimeout();
    }

    get timeout(): number {
        return this._timeout;
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
