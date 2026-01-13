import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Pid } from "../domain/types/pid";
import { Scheduler } from "./scheduler";

export class PidController {
  private readonly MAX_THRESHOLD = 100; // Can't be more than 100% usage
  private readonly MIN_THRESHOLD = 0;   // Can't be less than 0% usage
  
  private readonly KP: number;
  private readonly KI: number;

  private currentThreshold = 0.0;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly priorityQueue: PriorityQueue,
    pid: Pid
  ) {
    this.KP = pid.KP;
    this.KI = pid.KI;
  }

  updateThreshold(): number {
    const controlError = this.getControlError();
    const weightedError = controlError * this.KP + controlError * this.KI;

    this.currentThreshold += weightedError;

    if (this.currentThreshold > this.MAX_THRESHOLD) {
      this.currentThreshold = this.MAX_THRESHOLD;
    } else if (this.currentThreshold < this.MIN_THRESHOLD) {
      this.currentThreshold = this.MIN_THRESHOLD;
    }

    this.priorityQueue.resetCounters();

    return this.currentThreshold;
  }

  private getControlError(): number {
    const inRequests = this.priorityQueue.entryRequests;
    const outRequests = this.priorityQueue.exitRequests;
    const maxInflights = this.scheduler.maxConcurrentRequests;
    
    const freeInflights = maxInflights - this.scheduler.processingRequests;
    const outPrime = outRequests === 0 ? maxInflights : outRequests;

    return (inRequests - (outRequests + freeInflights)) / outPrime;
  }
}
