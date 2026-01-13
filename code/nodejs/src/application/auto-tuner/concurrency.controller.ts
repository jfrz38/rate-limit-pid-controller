import { getLogger } from "../../core/logging/logger";
import { Statistics } from "../../domain/statistics/statistics";
import { Scheduler } from "../scheduler";
import { ControllerHistory } from "./controller-history";
import { LatencyController } from "./latency.controller";

export class ConcurrencyController {

    private inflightLimit = 10;

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
    }

    update(): void {
        let aggregatedLatency: number;
        try {
            aggregatedLatency = this.statistics.getPercentileLatencySuccessfulRequests();
        } catch {
            this.logger.info('Not enough stats to update inflight concurrent requests');
            return;
        }

        const currentThroughput = this.statistics.getSuccessfulThroughput();
        
        this.history.push(this.inflightLimit, currentThroughput);
        
        const newLimit = this.calculateNewLimit(aggregatedLatency);
        this.applyNewLimit(newLimit);
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
