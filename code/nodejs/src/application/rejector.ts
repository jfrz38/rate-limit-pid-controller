import { getLogger } from "../core/logging/logger";
import { intervalManager } from "../core/shutdown/interval-manager";
import { Event } from "../domain/events";
import { RejectedRequestException } from "../domain/exceptions/rejected-request.exception";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Request } from "../domain/request";
import { PidController } from "./pid-controller";
import { Statistics } from "./statistics";

export class Rejector {

    private threshold: number;
    private readonly MAX_QUEUE_EMPTY_TIME: number = 10;

    private logger = getLogger();

    constructor(
        private readonly priorityQueue: PriorityQueue,
        private readonly statistics: Statistics,
        private readonly pidController: PidController,
        initialThreshold: number,
        pidControllerInterval: number
    ) {
        this.threshold = initialThreshold;
        this.logger.info(`Initial threshold: ${this.threshold}`);
        this.startThresholdCheck(pidControllerInterval);
    }

    process(request: Request): void {
        this.statistics.add(request);

        if (request.priority > this.threshold) {
            request.status = Event.REJECTED;
            throw new RejectedRequestException(request.priority, this.threshold)
        }

        this.priorityQueue.add(request);
        request.status = Event.QUEUED;
    }

    updateThreshold(newThreshold: number): void {
        this.logger.info(`Threshold modified from ${this.threshold} to: ${newThreshold}`)
        this.threshold = newThreshold;
    }

    startThresholdCheck(interval: number): void {
        const id = setInterval(() => {
            if (this.isServiceOverloaded()) {
                const newThreshold = this.getPriorityThreshold();
                if (newThreshold !== this.threshold) {
                    this.updateThreshold(newThreshold);
                }
            }
        }, interval);

        intervalManager.add(id);
    }

    private isServiceOverloaded(): boolean {
        return this.priorityQueue.getTimeSinceLastEmpty() > this.MAX_QUEUE_EMPTY_TIME;
    }

    private getPriorityThreshold(): number {
        const pidThreshold = this.pidController.updateThreshold();
        return this.statistics.calculateCumulativePriorityDistribution(pidThreshold);
    }

}
