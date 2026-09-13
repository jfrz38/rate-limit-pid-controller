import { getLogger } from "../../core/logging/logger";
import { Statistics } from "../../domain/statistics/statistics";
import { Scheduler } from "../scheduler";
import { ControllerHistory } from "./controller-history";
import { LatencyController } from "./latency.controller";

export class ConcurrencyController {

    private inflightLimit: number;

    private readonly a = 3;
    private readonly b = 5;

    private observedInflight = 0;
    private lowerBoundHits = 0;

    private logger = getLogger();

    constructor(
        private readonly scheduler: Scheduler,
        private readonly statistics: Statistics,
        private readonly latencyController: LatencyController,
        private readonly history: ControllerHistory,
    ) {
        this.inflightLimit = this.scheduler.maxConcurrentRequests;
    }

    update(): void {
        this.observedInflight = Math.max(
            this.observedInflight,
            this.scheduler.consumeMaxObservedConcurrentRequests(),
            this.scheduler.processingRequests
        );
        const snapshot = this.statistics.takeSnapshot();
        if (snapshot === null) {
            this.observedInflight = this.scheduler.processingRequests;
            this.logger.info('Closed execution bucket without enough stats to tune concurrency');
            return;
        }
        if (snapshot === undefined) {
            this.logger.info('Not enough stats to update inflight concurrent requests');
            return;
        }

        const observedInflight = this.observedInflight;
        this.observedInflight = this.scheduler.processingRequests;
        this.history.push(observedInflight, snapshot.throughputPerSecond);

        const aggregatedLatency = this.latencyController.aggregate(snapshot.percentileLatency);
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

        const upperBound = Math.max(1, observedInflight) * 10;
        newLimit = Math.max(1, Math.min(newLimit, upperBound));

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

        if (this.inflightLimit === 1) {
            this.lowerBoundHits++;
            if (this.lowerBoundHits >= 3) {
                this.latencyController.reset();
                this.lowerBoundHits = 0;
            }
        } else {
            this.lowerBoundHits = 0;
        }
    }
}
