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
import type {
  AcquireOptions,
  AdmissionOutcome,
  AdmissionPermit,
  ControllerDiagnosticEvent,
  ControllerDiagnosticListener,
  ControllerDiagnostics,
  ControllerErrorPayload,
  ControllerOptions,
  RunOptions,
  StatisticsSnapshot,
} from './types.js';

interface PendingAdmission {
  resolve: (permit: AdmissionPermit | PromiseLike<AdmissionPermit>) => void;
  reject: (reason?: unknown) => void;
  state: 'queued' | 'started';
  abort?: { signal: AbortSignal; listener: () => void };
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
  private readonly pending = new Map<bigint, PendingAdmission>();
  private timer: unknown | undefined;
  private timerGeneration = 0;
  private shutdownRequested = false;
  private readonly diagnosticListeners = new Set<ControllerDiagnosticListener>();
  private latestPublishedStatisticsId: bigint | undefined;
  private latestControllerDiagnostics: ControllerDiagnostics | undefined;

  constructor(
    options: ControllerOptions = {},
    private readonly dependencies: ControllerDependencies = systemDependencies,
  ) {
    this.component = createValidatedComponentController(options);
  }

  run<T>(
    task: () => T | Promise<T>,
    priority: Priority = Priority.default(),
    options: RunOptions = {},
  ): Promise<T> {
    return this.runWithPermit(task, priority, options);
  }

  acquire(
    priority: Priority = Priority.default(),
    options: AcquireOptions = {},
  ): Promise<AdmissionPermit> {
    if (this.shutdownRequested) {
      return Promise.reject(new ControllerShutdownError());
    }
    if (options.signal?.aborted) {
      return Promise.reject(new CancelledRequestError(undefined, 'requested'));
    }

    let resolve!: (permit: AdmissionPermit | PromiseLike<AdmissionPermit>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<AdmissionPermit>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    try {
      const submission = this.component.submit(priority.value, this.now());
      this.pending.set(submission.requestId, { resolve, reject, state: 'queued' });
      this.processActions(submission.actions);
      this.observeAbort(submission.requestId, options.signal);
      this.rescheduleDeadline();
    } catch (error) {
      reject(this.translateProtocolError(error));
    }

    return promise;
  }

  private async runWithPermit<T>(
    task: () => T | Promise<T>,
    priority: Priority,
    options: RunOptions,
  ): Promise<T> {
    const permit = await this.acquire(priority, options);
    let value: T;
    try {
      value = await task();
    } catch (taskError) {
      try {
        permit.complete('failure');
      } catch {
        // Preserve the task's original failure after the work has already run.
      }
      throw taskError;
    }
    permit.complete('success');
    return value;
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

  onDiagnostic(listener: ControllerDiagnosticListener): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  private processActions(actions: ComponentAction[]): void {
    const diagnostics: ControllerDiagnosticEvent[] = [];
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
          diagnostics.push({
            type: 'threshold-changed',
            previous: action.val.previous,
            current: action.val.current,
          });
          break;
        case 'concurrency-changed':
          diagnostics.push({
            type: 'concurrency-changed',
            previous: action.val.previous,
            current: action.val.current,
          });
          break;
      }
    }
    const statistics = this.component.latestStatistics();
    if (statistics !== undefined && statistics.id !== this.latestPublishedStatisticsId) {
      this.latestPublishedStatisticsId = statistics.id;
      diagnostics.push({ type: 'statistics-published', snapshot: statistics });
    }
    for (const diagnostic of diagnostics) {
      this.publishDiagnostic(diagnostic);
    }
    this.publishControllerDiagnostics();
  }

  private publishControllerDiagnostics(): void {
    const componentDiagnostics = this.component.latestDiagnostics();
    const diagnostics: ControllerDiagnostics = {
      threshold: componentDiagnostics.threshold,
      concurrencyLimit: componentDiagnostics.concurrencyLimit,
      queueTimeoutMs: componentDiagnostics.queueTimeoutMs,
      targetLatencyMs: componentDiagnostics.targetLatencyMs,
      aggregatedLatencyMs: componentDiagnostics.aggregatedLatencyMs,
    };
    if (sameDiagnostics(this.latestControllerDiagnostics, diagnostics)) {
      return;
    }
    this.latestControllerDiagnostics = diagnostics;
    this.publishDiagnostic({ type: 'controller-diagnostics', diagnostics });
  }

  private publishDiagnostic(diagnostic: ControllerDiagnosticEvent): void {
    for (const listener of this.diagnosticListeners) {
      try {
        listener(diagnostic);
      } catch {
        // Diagnostic consumers must not change admission or task outcomes.
      }
    }
  }

  private start(requestId: bigint): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.state !== 'queued') {
      throw new Error(`component started unknown or non-queued request ${requestId}`);
    }
    pending.state = 'started';
    this.removeAbortListener(pending);
    const permit = this.createPermit(requestId);
    this.dependencies.defer(() => pending.resolve(permit));
  }

  private createPermit(requestId: bigint): AdmissionPermit {
    let completed = false;
    return {
      complete: (outcome) => {
        if (completed) {
          throw new Error('Admission permit has already been completed');
        }
        completed = true;
        this.complete(requestId, outcome);
      },
    };
  }

  private complete(requestId: bigint, outcome: AdmissionOutcome): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.state !== 'started') {
      throw new Error(`cannot complete unknown or non-started request ${requestId}`);
    }
    this.pending.delete(requestId);
    try {
      this.processActions(this.component.complete(requestId, outcome, this.now()));
    } catch (error) {
      throw this.translateProtocolError(error);
    } finally {
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
    this.removeAbortListener(pending);
    pending.reject(error);
  }

  private observeAbort(requestId: bigint, signal: AbortSignal | undefined): void {
    const pending = this.pending.get(requestId);
    if (!signal || !pending || pending.state !== 'queued') {
      return;
    }
    const listener = () => this.cancelQueued(requestId);
    pending.abort = { signal, listener };
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) {
      listener();
    }
  }

  private cancelQueued(requestId: bigint): void {
    const pending = this.pending.get(requestId);
    if (!pending || pending.state !== 'queued') {
      return;
    }
    try {
      this.processActions(this.component.cancel(requestId, this.now()));
    } catch (error) {
      this.pending.delete(requestId);
      this.removeAbortListener(pending);
      pending.reject(this.translateProtocolError(error));
    } finally {
      this.rescheduleDeadline();
    }
  }

  private removeAbortListener(pending: PendingAdmission): void {
    if (pending.abort) {
      pending.abort.signal.removeEventListener('abort', pending.abort.listener);
      pending.abort = undefined;
    }
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

function sameDiagnostics(
  previous: ControllerDiagnostics | undefined,
  current: ControllerDiagnostics,
): boolean {
  return previous !== undefined
    && previous.threshold === current.threshold
    && previous.concurrencyLimit === current.concurrencyLimit
    && previous.queueTimeoutMs === current.queueTimeoutMs
    && previous.targetLatencyMs === current.targetLatencyMs
    && previous.aggregatedLatencyMs === current.aggregatedLatencyMs;
}
