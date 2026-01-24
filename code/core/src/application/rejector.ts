import { getLogger } from "../core/logging/logger";
import { intervalManager } from "../core/shutdown/interval-manager";
import { Event } from "../domain/events";
import { RejectedRequestException } from "../domain/exceptions/rejected-request.exception";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Request } from "../domain/request";
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
        pidControllerInterval: number
    ) {
        this.threshold = initialThreshold;
        this.INITIAL_THRESHOLD = initialThreshold;
        this.logger.info(`Initial threshold: ${this.threshold}`);
        this.startThresholdCheck(pidControllerInterval);
    }

    public process(request: Request): void {
        this.statistics.add(request);

        if (request.priority > this.threshold) {
            request.status = Event.REJECTED;
            this.logger.info(`Rejected request ${request.id}. Priority ${request.priority}/${this.threshold}`);
            throw new RejectedRequestException(request.priority, this.threshold);
        }

        this.priorityQueue.add(request);
        request.status = Event.QUEUED;
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
            const pidPercentage = this.pidController.updateThreshold();
            try {
                if (this.isServiceOverloaded()) {
                    this.updateThresholdByPercentile(pidPercentage);
                    return;
                }
                this.updateThresholdByLinealRecovery(pidPercentage);
            } catch (e) {
                this.updateThresholdByLinealRecovery(pidPercentage);
            }
        }, interval);

        intervalManager.add(timer);
    }

    private isServiceOverloaded(): boolean {
        return this.priorityQueue.getSecondsSinceLastEmpty() > this.MAX_QUEUE_EMPTY_TIME;
    }

    private updateThresholdByPercentile(pidPercentage: number): void {
        const actualThreshold = this.statistics.calculateCumulativePriorityDistribution(pidPercentage);
        this.updateThreshold(actualThreshold);

    }
    private updateThresholdByLinealRecovery(pidPercentage: number): void {
        const directThreshold = Math.round((pidPercentage * this.INITIAL_THRESHOLD) / 100);
        this.updateThreshold(directThreshold);
    }
}
