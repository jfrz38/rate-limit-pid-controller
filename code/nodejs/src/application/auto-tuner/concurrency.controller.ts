import { getLogger } from "../../core/logging/logger";
import { Scheduler } from "../scheduler";
import { Statistics } from "../statistics";
import { LatencyController } from "./latency.controller";

export class ConcurrencyController {

    private intervalThroughput: number[] = [];
    private maxInflights: number[] = [];

    private inflightLimit = 10;

    private readonly a = 3;
    private readonly b = 5;

    private readonly cores = require("os").cpus().length;

    private logger = getLogger();

    constructor(
        private readonly scheduler: Scheduler,
        private readonly statistics: Statistics,
        private readonly latencyController: LatencyController,
        maxCores: number,
    ) {
        this.cores = Math.max(1, Math.min(maxCores, this.cores));
    }

    update(): void {
        let aggregatedLatency: number;
        try {
            aggregatedLatency = this.statistics.getPercentileLatencySuccessfulRequests();
        } catch {
            this.logger.info('Not enough stats to update inflight concurrent requests');
            return;
        }

        const intervalThroughput = this.statistics.getSuccessfulThroughput();
        this.pushFixed(this.intervalThroughput, intervalThroughput, 50);
        this.pushFixed(this.maxInflights, this.inflightLimit, 50);

        const newLimit = this.calculateNewLimit(aggregatedLatency);
        this.applyNewLimit(newLimit);
    }

    private pushFixed(queue: number[], value: number, maxSize: number): void {
        if (queue.length >= maxSize) {
            queue.shift();
        }
        queue.push(value);
    }

    private calculateNewLimit(aggregatedLatency: number): number {
        let queue = Math.round(this.inflightLimit * (1 - this.latencyController.targetLatency / aggregatedLatency));
        const alpha = this.a * Math.log10(this.inflightLimit);
        const beta = this.b * Math.log10(this.inflightLimit);

        if (queue < alpha) {
            queue += Math.floor(Math.log10(this.inflightLimit));
        } else if (queue > beta) {
            queue -= Math.floor(Math.log10(this.inflightLimit));
        }

        if (queue < this.cores) {
            queue = this.cores;
        } else if (queue > this.inflightLimit * 10) {
            queue = this.inflightLimit * 10;
        }

        return queue;
    }

    private applyNewLimit(newLimit: number): void {
        if (newLimit !== this.inflightLimit) {
            this.inflightLimit = newLimit;
            this.scheduler.updateMaxConcurrentRequests(this.inflightLimit);
            this.logger.info(`New inflightLimit: ${this.inflightLimit}`);
        }
    }
}
