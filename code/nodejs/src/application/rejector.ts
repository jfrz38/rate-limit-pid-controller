import { getLogger } from "../core/logging/logger";
import { intervalManager } from "../core/shutdown/interval-manager";
import { Event } from "../domain/events";
import { RejectedRequestException } from "../domain/exceptions/rejected-request.exception";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Request } from "../domain/request";
import { Statistics } from "../domain/statistics/statistics";
import { PidController } from "./pid-controller";

export class Rejector {

    private threshold: number;
    private readonly MAX_QUEUE_EMPTY_TIME: number = 10;

    private logger = getLogger();

    constructor(
        private readonly priorityQueue: PriorityQueue,
        private readonly statistics: Statistics,
        private readonly pidController: PidController,
        private initialThreshold: number,
        pidControllerInterval: number
    ) {
        this.threshold = initialThreshold;
        this.logger.info(`Initial threshold: ${this.threshold}`);
        this.startThresholdCheck(pidControllerInterval);
    }

    public process(request: Request): void {
        this.statistics.add(request);

        if (request.priority > this.threshold) {
            request.status = Event.REJECTED;
            throw new RejectedRequestException(request.priority, this.threshold);
        }

        this.priorityQueue.add(request);
        request.status = Event.QUEUED;
    }

    public updateThreshold(newThreshold: number): void {
        this.logger.info(`Threshold modified from ${this.threshold} to: ${newThreshold}`);
        this.threshold = newThreshold;
    }

    public startThresholdCheck(interval: number): void {
    const timer = setInterval(() => {
        if (this.isServiceOverloaded()) {
            const newThreshold = this.getPriorityThreshold();
            if (newThreshold !== this.threshold) {
                this.updateThreshold(newThreshold);
            }
        } else if (this.threshold !== this.initialThreshold) {
            this.updateThreshold(this.initialThreshold);
        }
    }, interval);

    intervalManager.add(timer);
}

    private isServiceOverloaded(): boolean {
        return this.priorityQueue.getTimeSinceLastEmpty() > this.MAX_QUEUE_EMPTY_TIME;
    }

    private getPriorityThreshold(): number {
        const pidThreshold = this.pidController.updateThreshold();
        return this.statistics.calculateCumulativePriorityDistribution(pidThreshold);
    }

}
