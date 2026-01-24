import { getLogger } from "../core/logging/logger";
import { PriorityQueue } from "../domain/priority-queue/priority-queue";
import { Pid } from "../domain/types/pid";
import { Scheduler } from "./scheduler";

export class PidController {
  private readonly MAX_THRESHOLD: number = 100;  // Percentage (0-100)
  private readonly MIN_THRESHOLD: number = 0;    // Percentage (0-100)
  private readonly MAX_DELTA_PERCENT: number; // Maximum change per iteration (in percentage points)
  private readonly INTEGRAL_DECAY: number; // Decay integral faster during recovery (was 0.8)

  private readonly KP: number;
  private readonly KI: number;
  private readonly KD: number;
  private readonly DT: number;

  private currentThreshold: number = 100;
  private integral = 0.0;
  private previousError = 0.0;

  private logger = getLogger();

  constructor(
    private readonly scheduler: Scheduler,
    private readonly priorityQueue: PriorityQueue,
    pid: Pid
  ) {
    this.KP = pid.KP;
    this.KI = pid.KI;
    this.KD = pid.KD;
    this.DT = pid.interval / 1000;
    this.MAX_DELTA_PERCENT = Math.min(100, Math.max(0, pid.delta));
    this.INTEGRAL_DECAY = pid.decayRatio;
  }

  updateThreshold(): number {
    const controlError = this.getControlError();

    if (controlError <= 0) {
      return this.thresholdForSystemUnderused(controlError);
    }

    return this.thresholdForSystemOverloaded(controlError);

  }

  private getControlError(): number {
    const processingRequests = this.scheduler.processingRequests;
    const maxInflights = this.scheduler.maxConcurrentRequests;
    const totalInFlight = processingRequests + this.priorityQueue.length;

    const error = (totalInFlight - maxInflights) / maxInflights;

    return error;
  }

  private thresholdForSystemUnderused(controlError: number): number {
    this.integral *= this.INTEGRAL_DECAY;
    this.integral += controlError * this.DT;

    const derivative = (controlError - this.previousError) / this.DT;
    this.previousError = controlError;

    const pidOutput = -((this.KP * controlError) + (this.KI * this.integral) + (this.KD * derivative));

    const maxDelta = this.MAX_DELTA_PERCENT * this.DT;
    const delta = Math.max(0, Math.min(maxDelta, Math.abs(pidOutput)));

    this.logger.debug(`[PID-RECOVERY] Error: ${controlError.toFixed(4)}, Integral: ${this.integral.toFixed(4)}, PIDOutput: ${pidOutput.toFixed(4)}, Delta: ${delta.toFixed(4)}, Threshold: ${this.currentThreshold.toFixed(2)} to ${(this.currentThreshold + delta).toFixed(2)}`);

    if (delta > 0) {
      this.currentThreshold += delta;
    }

    if (this.currentThreshold > this.MAX_THRESHOLD) {
      this.currentThreshold = this.MAX_THRESHOLD;
      this.integral -= controlError;
    }

    return this.currentThreshold;
  }

  private thresholdForSystemOverloaded(controlError: number): number {
    if (controlError < 0.01) {
      return this.currentThreshold;
    }

    this.integral += controlError * this.DT;

    const derivative = (controlError - this.previousError) / this.DT;
    this.previousError = controlError;

    const pidOutput = (this.KP * controlError) + (this.KI * this.integral) + (this.KD * derivative);

    const maxDelta = this.MAX_DELTA_PERCENT * this.DT;
    const delta = -Math.max(0, Math.min(maxDelta, pidOutput));

    this.logger.debug(`[PID-OVERLOAD] Error: ${controlError.toFixed(4)}, Integral: ${this.integral.toFixed(4)}, PIDOutput: ${pidOutput.toFixed(4)}, Delta: ${delta.toFixed(4)}, Threshold: ${this.currentThreshold.toFixed(2)} to ${(this.currentThreshold + delta).toFixed(2)}`);

    this.currentThreshold += delta;

    if (this.currentThreshold < this.MIN_THRESHOLD) {
      this.currentThreshold = this.MIN_THRESHOLD;
      this.integral -= controlError;
    }

    return this.currentThreshold;
  }
}
