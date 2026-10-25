import type { AdmissionController as ComponentController } from './generated/interfaces/jfrz38-adaptive-admission-controller.js';
import type { RejectionReason } from './generated/interfaces/jfrz38-adaptive-admission-controller.js';

import {
  componentErrorPayload,
  type ComponentAction,
  type ComponentControllerError,
} from './component-runtime.js';
import { createValidatedComponentController } from './configuration.js';
import {
  CancelledRequestError,
  ControllerProtocolError,
  ControllerShutdownError,
  EvictedRequestError,
  QueueFullError,
  ThresholdRejectedError,
} from './errors.js';
import { Priority } from './priority.js';
import type { ControllerErrorPayload, ControllerOptions, StatisticsSnapshot } from './types.js';

interface PendingTask<T = unknown> {
  task: () => T | Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  state: 'queued' | 'started';
}

export interface MonotonicClock {
  nowMilliseconds(): bigint;
}

export interface DeadlineScheduler {
  schedule(callback: () => void, delayMilliseconds: number): unknown;
  cancel(handle: unknown): void;
}

export interface ControllerDependencies {
  clock: MonotonicClock;
  scheduler: DeadlineScheduler;
  defer(callback: () => void): void;
}

const systemDependencies: ControllerDependencies = {
  clock: {
    nowMilliseconds: () => process.hrtime.bigint() / 1_000_000n,
  },
  scheduler: {
    schedule: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  defer: queueMicrotask,
};

const MAX_TIMER_DELAY_MS = 2_147_483_647n;

export class AdaptiveAdmissionController {
  private readonly component: ComponentController;
  private readonly pending = new Map<bigint, PendingTask<any>>();
  private timer: unknown | undefined;
  private timerGeneration = 0;
  private shutdownRequested = false;

  constructor(
    options: ControllerOptions = {},
    private readonly dependencies: ControllerDependencies = systemDependencies,
  ) {
    this.component = createValidatedComponentController(options);
  }

  run<T>(task: () => T | Promise<T>, priority: Priority = Priority.default()): Promise<T> {
    if (this.shutdownRequested) {
      return Promise.reject(new ControllerShutdownError());
    }

    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    try {
      const submission = this.component.submit(priority.value, this.now());
      this.pending.set(submission.requestId, { task, resolve, reject, state: 'queued' });
      this.processActions(submission.actions);
      this.rescheduleDeadline();
    } catch (error) {
      reject(this.translateProtocolError(error));
    }

    return promise;
  }

  shutdown(): void {
    if (this.shutdownRequested) {
      return;
    }
    this.shutdownRequested = true;
    try {
      this.processActions(this.component.shutdown(this.now()));
      this.rescheduleDeadline();
    } catch (error) {
      this.clearTimer();
      throw this.translateProtocolError(error);
    }
  }

  latestStatistics(): StatisticsSnapshot | undefined {
    return this.component.latestStatistics();
  }

  priorityPercentile(percentile: number): number | undefined {
    if (!Number.isInteger(percentile) || percentile < 0 || percentile > 100) {
      throw new RangeError('percentile must be an integer between 0 and 100');
    }
    return this.component.priorityPercentile(percentile);
  }

  private processActions(actions: ComponentAction[]): void {
    for (const action of actions) {
      switch (action.tag) {
        case 'start':
          this.start(action.val);
          break;
        case 'reject':
          this.reject(action.val.requestId, action.val.reason);
          break;
        case 'evict':
          this.settleRejected(action.val.requestId, new EvictedRequestError(action.val.requestId));
          break;
        case 'cancel':
          this.settleRejected(
            action.val.requestId,
            action.val.reason === 'shutdown'
              ? new ControllerShutdownError(action.val.requestId)
              : new CancelledRequestError(action.val.requestId, action.val.reason),
          );
          break;
        case 'threshold-changed':
        case 'concurrency-changed':
          break;
      }
    }
  }

  private start(requestId: bigint): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.state !== 'queued') {
      throw new Error(`component started unknown or non-queued request ${requestId}`);
    }
    pending.state = 'started';
    this.dependencies.defer(() => {
      Promise.resolve()
        .then(pending.task)
        .then(
          (value) => this.completeSuccess(requestId, pending, value),
          (error: unknown) => this.completeFailure(requestId, pending, error),
        );
    });
  }

  private completeSuccess<T>(requestId: bigint, pending: PendingTask<T>, value: T): void {
    this.pending.delete(requestId);
    try {
      this.processActions(this.component.complete(requestId, 'success', this.now()));
      pending.resolve(value);
    } catch (error) {
      pending.reject(this.translateProtocolError(error));
    } finally {
      this.rescheduleDeadline();
    }
  }

  private completeFailure(requestId: bigint, pending: PendingTask, taskError: unknown): void {
    this.pending.delete(requestId);
    try {
      this.processActions(this.component.complete(requestId, 'failure', this.now()));
    } catch {
      // The task's original failure remains the public result. Protocol failures are not allowed to
      // replace application errors after the task has already run.
    } finally {
      pending.reject(taskError);
      this.rescheduleDeadline();
    }
  }

  private reject(
    requestId: bigint,
    reason: RejectionReason,
  ): void {
    switch (reason.tag) {
      case 'threshold':
        this.settleRejected(
          requestId,
          new ThresholdRejectedError(requestId, reason.val!.priority, reason.val!.threshold),
        );
        break;
      case 'queue-full':
        this.settleRejected(requestId, new QueueFullError(requestId));
        break;
      case 'shutdown':
        this.settleRejected(requestId, new ControllerShutdownError(requestId));
        break;
    }
  }

  private settleRejected(requestId: bigint, error: unknown): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      throw new Error(`component settled unknown request ${requestId}`);
    }
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private rescheduleDeadline(): void {
    this.clearTimer();
    const deadline = this.component.nextDeadline();
    if (deadline === undefined) {
      return;
    }
    const generation = ++this.timerGeneration;
    const remaining = deadline > this.now() ? deadline - this.now() : 0n;
    const boundedDelay = remaining > MAX_TIMER_DELAY_MS ? MAX_TIMER_DELAY_MS : remaining;
    this.timer = this.dependencies.scheduler.schedule(() => {
      if (generation !== this.timerGeneration) {
        return;
      }
      this.timer = undefined;
      try {
        this.processActions(this.component.advanceTime(this.now()));
      } finally {
        this.rescheduleDeadline();
      }
    }, Number(boundedDelay));
  }

  private clearTimer(): void {
    this.timerGeneration += 1;
    if (this.timer !== undefined) {
      this.dependencies.scheduler.cancel(this.timer);
      this.timer = undefined;
    }
  }

  private now(): bigint {
    return this.dependencies.clock.nowMilliseconds();
  }

  private translateProtocolError(error: unknown): unknown {
    const payload = componentErrorPayload(error);
    if (isSubmitError(payload) && payload.tag === 'controller') {
      return new ControllerProtocolError(payload.val);
    }
    if (isControllerError(payload)) {
      return new ControllerProtocolError(payload);
    }
    return error;
  }
}

function isControllerError(payload: unknown): payload is ControllerErrorPayload & ComponentControllerError {
  return typeof payload === 'object'
    && payload !== null
    && 'tag' in payload
    && typeof (payload as { tag: unknown }).tag === 'string';
}

function isSubmitError(payload: unknown): payload is { tag: 'controller'; val: ControllerErrorPayload } {
  return typeof payload === 'object'
    && payload !== null
    && 'tag' in payload
    && (payload as { tag: unknown }).tag === 'controller'
    && 'val' in payload;
}
