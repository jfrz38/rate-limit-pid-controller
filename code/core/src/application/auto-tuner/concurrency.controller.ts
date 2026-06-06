import { getLogger } from "../../core/logging/logger";
import { NotEnoughStatsException } from "../../domain/exceptions/not-enough-stats.exception";
import { Statistics } from "../../domain/statistics/statistics";
import { Scheduler } from "../scheduler";
import { ControllerHistory } from "./controller-history";
import { LatencyController } from "./latency.controller";

export class ConcurrencyController {

    private inflightLimit: number;

    private readonly a = 3;
    private readonly b = 5;

    private readonly cores = require("os").cpus().length;

    private logger = getLogger();

    constructor(
        private readonly scheduler: Scheduler,
        private readonly statistics: Statistics,
        private readonly latencyController: LatencyController,
        private readonly history: ControllerHistory,
        maxCores: number,
    ) {
        this.cores = Math.max(1, Math.min(maxCores, this.cores));
        this.inflightLimit = Math.max(this.cores, this.scheduler.maxConcurrentRequests ?? 10);
    }

    update(): void {
        let aggregatedLatency: number;
        try {
            aggregatedLatency = this.statistics.getPercentileLatencySuccessfulRequests();
        } catch (error) {
            if (error instanceof NotEnoughStatsException) {
                this.logger.info('Not enough stats to update inflight concurrent requests');
            }
            return;
        }

        const observedInflight = Math.max(
            this.scheduler.consumeMaxObservedConcurrentRequests?.() ?? this.scheduler.processingRequests ?? 0,
            this.scheduler.processingRequests ?? 0
        );
        const currentThroughput = this.statistics.getSuccessfulThroughputPerSecond?.() ?? this.statistics.getSuccessfulThroughput();

        this.history.push(observedInflight, currentThroughput);

        const newLimit = this.calculateNewLimit(aggregatedLatency, observedInflight);
        this.applyNewLimit(newLimit);
    }

    private calculateNewLimit(aggregatedLatency: number, observedInflight: number): number {
        if (aggregatedLatency <= 0 || this.latencyController.targetLatency <= 0) {
            return this.inflightLimit;
        }

        const queue = this.inflightLimit * (1 - this.latencyController.targetLatency / aggregatedLatency);
        const alpha = this.a * Math.log10(this.inflightLimit);
        const beta = this.b * Math.log10(this.inflightLimit);
        const step = Math.max(1, Math.floor(Math.log10(this.inflightLimit)));
        let newLimit = this.inflightLimit;

        if (queue <= alpha) {
            newLimit += step;
        } else if (queue > beta) {
            newLimit -= step;
        }

        const upperBound = Math.max(this.cores, Math.max(1, observedInflight) * 10);
        newLimit = Math.max(this.cores, Math.min(newLimit, upperBound));

        return Math.round(newLimit);
    }

    private applyNewLimit(newLimit: number): void {
        if (!Number.isFinite(newLimit)) {
            this.logger.warn(`Ignored unstable new limit ${newLimit}`);
            return;
        }

        if (newLimit !== this.inflightLimit) {
            this.inflightLimit = newLimit;
            this.scheduler.updateMaxConcurrentRequests(this.inflightLimit);
            this.logger.info(`New inflightLimit: ${this.inflightLimit}`);
        }
    }
}
