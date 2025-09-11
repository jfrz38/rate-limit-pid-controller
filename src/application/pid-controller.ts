import { PriorityQueue } from "../domain/priority-queue";
import { Scheduler } from "./scheduler";

export class PidController {
  private readonly KP = 0.1;
  private readonly KI = 1.4;

  private readonly MAX_THRESHOLD = 100; // Can't be more than 100% usage
  private readonly MIN_THRESHOLD = 0;   // Can't be less than 0% usage

  private currentThreshold = 0.0;      // Initially threshold

  constructor(
    private readonly scheduler: Scheduler,
    private readonly priorityQueue: PriorityQueue
  ) { }

  updateThreshold(): number {
    const controlError = this.getControlError();
    const weightedError = controlError * this.KP + controlError * this.KI;

    this.currentThreshold += weightedError;

    if (this.currentThreshold > this.MAX_THRESHOLD) {
      this.currentThreshold = this.MAX_THRESHOLD;
    } else if (this.currentThreshold < this.MIN_THRESHOLD) {
      this.currentThreshold = this.MIN_THRESHOLD;
    }

    return this.currentThreshold;
  }

  private getControlError(): number {
    const inRequests = this.priorityQueue.entryRequests;
    const outRequests = this.priorityQueue.exitRequests;
    const maxInflights = this.scheduler.getMaxConcurrentRequests();
    const freeInflights = maxInflights - this.scheduler.getProcessingRequests();
    const outPrime = outRequests === 0 ? maxInflights : outRequests;

    return (inRequests - (outRequests + freeInflights)) / outPrime;
  }
}
