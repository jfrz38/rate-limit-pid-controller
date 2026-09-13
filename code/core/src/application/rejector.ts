import { getLogger } from "../core/logging/logger";
import { IntervalManager } from "../core/shutdown/interval-manager";
import { Event } from "../domain/events";
import { RejectedRequestException } from "../domain/exceptions/rejected-request.exception";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Request } from "../domain/request";
import { Priority } from "../domain/priority";
import { Statistics } from "../domain/statistics/statistics";
import { PidController } from "./pid-controller";

export class Rejector {

    private readonly INITIAL_THRESHOLD: number;
    private threshold: number;
    private readonly MAX_QUEUE_EMPTY_TIME: number = 10;

    private logger = getLogger();

    constructor(
        private readonly priorityQueue: PriorityQueue,
        private readonly statistics: Statistics,
        private readonly pidController: PidController,
        readonly initialThreshold: number,
        pidControllerInterval: number,
        private readonly intervals: IntervalManager,
    ) {
        this.threshold = initialThreshold;
        this.INITIAL_THRESHOLD = initialThreshold;
        this.logger.info(`Initial threshold: ${this.threshold}`);
        this.startThresholdCheck(pidControllerInterval);
    }

    public process(request: Request<any>): void {
        this.statistics.add(request);

        if (request.priority >= this.threshold) {
            request.transitionTo(Event.REJECTED);
            const error = new RejectedRequestException(request.priority, this.threshold);
            request.reject?.(error);
            this.logger.info(`Rejected request ${request.id}: Priority ${request.priority}/${this.threshold}`);
            throw error;
        }

        request.transitionTo(Event.QUEUED);
        this.priorityQueue.add(request);
    }

    public updateThreshold(newThreshold: number): void {
        if (newThreshold === this.threshold) {
            return;
        }

        this.logger.info(`Threshold modified from ${this.threshold} to: ${newThreshold}`);
        this.threshold = newThreshold;
    }

    public startThresholdCheck(interval: number): void {
        const timer = setInterval(() => {
            try {
                const pidPercentage = this.pidController.updateThreshold();
                if (!Number.isFinite(pidPercentage)) {
                    return;
                }
                if (this.isServiceOverloaded()) {
                    try {
                        this.updateThresholdByPercentile(pidPercentage);
                    } catch (error) {
                        this.logger.warn({ error }, 'Unable to calculate priority percentile; using linear recovery');
                        this.updateThresholdByLinealRecovery(pidPercentage);
                    }
                    return;
                }
                this.updateThresholdByLinealRecovery(pidPercentage);
            } catch (e) {
                this.logger.warn({ error: e }, 'Unable to update admission threshold');
            }
        }, interval);

        this.intervals.add(timer);
    }

    private isServiceOverloaded(): boolean {
        return this.priorityQueue.getSecondsSinceLastEmpty() > this.MAX_QUEUE_EMPTY_TIME;
    }

    private updateThresholdByPercentile(pidPercentage: number): void {
        if (pidPercentage <= 0) {
            this.updateThreshold(0);
            return;
        }
        if (pidPercentage >= 100) {
            this.updateThreshold(Priority.ALLOW_ALL_THRESHOLD);
            return;
        }
        const actualThreshold = Math.min(
            Priority.ALLOW_ALL_THRESHOLD,
            this.statistics.calculateCumulativePriorityDistribution(pidPercentage) + 1
        );
        this.updateThreshold(actualThreshold);

    }
    private updateThresholdByLinealRecovery(pidPercentage: number): void {
        const directThreshold = Math.round((pidPercentage * this.INITIAL_THRESHOLD) / 100);
        this.updateThreshold(directThreshold);
    }
}
