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
        readonly initialThreshold: number,
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
            this.logger.info(`Rejected request. Priority ${request.priority}/${this.threshold}`);
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

            const pidPercentage = this.pidController.updateThreshold();

            try {
                if(this.isServiceOverloaded()) {
                    const actualThreshold = this.statistics.calculateCumulativePriorityDistribution(pidPercentage);
                    if (actualThreshold !== this.threshold) {
                        this.updateThreshold(actualThreshold);
                    }
                } else {
                    const directThreshold = Math.round((pidPercentage * 768) / 100);
                    if (directThreshold !== this.threshold) {
                        this.updateThreshold(directThreshold);
                    }
                }
            } catch (e) {
                // TODO: Variable max threshold
                const directThreshold = Math.round((pidPercentage * 768) / 100);
                if (directThreshold !== this.threshold) {
                    this.updateThreshold(directThreshold);
                }
            }
        }, interval);

        intervalManager.add(timer);
    }

    private isServiceOverloaded(): boolean {
        // console.log(`[LAST EMPTY] VACÍA HACE ${this.priorityQueue.getSecondsSinceLastEmpty()} s`);
        return this.priorityQueue.getSecondsSinceLastEmpty() > this.MAX_QUEUE_EMPTY_TIME;
    }

    // private getPriorityThreshold(): number {
    //     const pidThreshold = this.pidController.updateThreshold();
    //     return this.statistics.calculateCumulativePriorityDistribution(pidThreshold);
    // }
}
