import { Scheduler } from "../scheduler";
import { Statistics } from "../statistics";
import { LatencyController } from "./latency.controller";

export class ConcurrencyController {

    private intervalThroughputs: number[] = [];
    private maxInflights: number[] = [];

    private inflightLimit = 10;

    private readonly a = 3;
    private readonly b = 5;

    private readonly cores = require("os").cpus().length;

    constructor(
        private readonly scheduler: Scheduler,
        private readonly statistics: Statistics,
        private readonly latencyController: LatencyController,
    ) { }

    update(): void {
        const intervalEnd = new Date();

        let aggregatedLatency: number;
        try {
            aggregatedLatency = this.statistics.getPercentileLatencySuccessfulRequests(intervalEnd);
        } catch {
            console.info('Not enough stats to update inflight concurrent requests');
            return;
        }

        const intervalThroughput = this.statistics.getThroughputForInterval(intervalEnd);
        this.pushFixed(this.intervalThroughputs, intervalThroughput, 50);
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

        if (queue < this.cores) queue = this.cores;
        if (queue > this.inflightLimit * 10) queue = this.inflightLimit * 10;

        return queue;
    }

    private applyNewLimit(newLimit: number): void {
        if (newLimit !== this.inflightLimit) {
            this.inflightLimit = newLimit;
            this.scheduler.updateMaxConcurrentRequests(this.inflightLimit);
            console.info('New inflightLimit: ', this.inflightLimit);
        }
    }
}
