import logger from "../core/logging/logger";
import { intervalManager } from "../core/shutdown/interval-manager";
import { Event } from "../domain/events";
import { RejectedRequestException } from "../domain/exceptions/rejected-request.exception";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Request } from "../domain/request";
import { PidController } from "./pid-controller";
import { Statistics } from "./statistics";

export class Rejector {

    private threshold: number = 768;
    private readonly MAX_QUEUE_EMPTY_TIME: number = 10;

    constructor(
        private readonly priorityQueue: PriorityQueue,
        private readonly statistics: Statistics,
        private readonly pidController: PidController
    ) {
        this.startThresholdCheck();
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
        const oldThreshold = this.threshold;
        this.threshold = newThreshold;

        logger.info(`Threshold modified from ${oldThreshold} to: ${newThreshold}`)

        const isDecreased = oldThreshold < this.threshold
        if (isDecreased) {
            // TODO: Crear método de la cola para cuando baje el threshold eliminar los valores que ya no deberían ejecutarse
        }
    }

    startThresholdCheck(interval: number = 500): void {
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
