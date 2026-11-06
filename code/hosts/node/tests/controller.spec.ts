import { describe, expect, test, vi } from 'vitest';

import {
  AdaptiveAdmissionController,
  CancelledRequestError,
  ControllerShutdownError,
  EvictedRequestError,
  Priority,
  QueueFullError,
  ThresholdRejectedError,
} from '../src/index.js';
import type { ControllerDependencies, DeadlineScheduler } from '../src/controller.js';
import type { ControllerDiagnosticEvent } from '../src/types.js';

describe('AdaptiveAdmissionController', () => {
  test('returns successful values and preserves task failures', async () => {
    const controller = controllerWithSlowControlLoops();
    const failure = new Error('task failed');

    await expect(controller.run(() => 42, Priority.fromValue(0))).resolves.toBe(42);
    await expect(controller.run(() => Promise.reject(failure), Priority.fromValue(0))).rejects.toBe(failure);

    controller.shutdown();
  });

  test('starts queued work by priority when capacity becomes available', async () => {
    const controller = controllerWithSlowControlLoops();
    const blocker = deferred<void>();
    const started = deferred<void>();
    const order: string[] = [];

    const active = controller.run(async () => {
      order.push('active');
      started.resolve();
      await blocker.promise;
    }, Priority.fromValue(0));
    await started.promise;

    const lessImportant = controller.run(() => order.push('less-important'), Priority.fromValue(500));
    const moreImportant = controller.run(() => order.push('more-important'), Priority.fromValue(10));
    blocker.resolve();

    await Promise.all([active, lessImportant, moreImportant]);
    expect(order).toEqual(['active', 'more-important', 'less-important']);
    controller.shutdown();
  });

  test('starts equal-priority queued work in FIFO order', async () => {
    const controller = controllerWithSlowControlLoops();
    const blocker = deferred<void>();
    const started = deferred<void>();
    const order: string[] = [];

    const active = controller.run(async () => {
      started.resolve();
      await blocker.promise;
    }, Priority.fromValue(0));
    await started.promise;

    const first = controller.run(() => order.push('first'), Priority.fromValue(10));
    const second = controller.run(() => order.push('second'), Priority.fromValue(10));
    blocker.resolve();

    await Promise.all([active, first, second]);
    expect(order).toEqual(['first', 'second']);
    controller.shutdown();
  });

  test('evicts queued work when the component deadline elapses', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      queueTimeoutMs: 10,
      pid: { intervalMs: 10_000 },
    }, runtime.dependencies);
    const blocker = deferred<void>();

    const active = controller.run(() => blocker.promise, Priority.fromValue(0));
    runtime.flushDeferred();
    const queuedTask = vi.fn();
    const queued = controller.run(queuedTask, Priority.fromValue(1));

    expect(runtime.scheduler.activeCount).toBe(1);
    runtime.advanceTo(10n);

    await expect(queued).rejects.toBeInstanceOf(EvictedRequestError);
    expect(queuedTask).not.toHaveBeenCalled();

    blocker.resolve();
    await active;
    controller.shutdown();
  });

  test('translates threshold and queue-capacity rejections without running tasks', async () => {
    const thresholdTask = vi.fn();
    const thresholdController = new AdaptiveAdmissionController({ initialThreshold: 1 });

    await expect(thresholdController.run(thresholdTask, Priority.fromValue(1)))
      .rejects.toBeInstanceOf(ThresholdRejectedError);
    expect(thresholdTask).not.toHaveBeenCalled();
    thresholdController.shutdown();

    const queueController = controllerWithSlowControlLoops({ maxQueuedRequests: 0 });
    const blocker = deferred<void>();
    const started = deferred<void>();
    const active = queueController.run(async () => {
      started.resolve();
      await blocker.promise;
    }, Priority.fromValue(0));
    await started.promise;

    await expect(queueController.run(() => undefined, Priority.fromValue(1)))
      .rejects.toBeInstanceOf(QueueFullError);

    blocker.resolve();
    await active;
    queueController.shutdown();
  });

  test('ignores a cancelled stale deadline callback', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      pid: { intervalMs: 10_000 },
    }, runtime.dependencies);

    const active = controller.run(() => undefined, Priority.fromValue(0));
    const staleCallback = runtime.scheduler.latestCallback;
    const queued = controller.run(() => undefined, Priority.fromValue(1));

    expect(runtime.scheduler.activeCount).toBe(1);
    staleCallback();
    expect(runtime.scheduler.activeCount).toBe(1);

    controller.shutdown();
    runtime.flushDeferred();
    await expect(queued).rejects.toBeInstanceOf(ControllerShutdownError);
    await active;
  });

  test('allows a started task to submit more work without re-entering the component call', async () => {
    const controller = controllerWithSlowControlLoops();

    const outer = controller.run(async () => {
      const nested = controller.run(() => 'nested', Priority.fromValue(1));
      return { nested };
    }, Priority.fromValue(0));
    const { nested } = await outer;

    await expect(nested).resolves.toBe('nested');
    controller.shutdown();
  });

  test('keeps controller instances independent', async () => {
    const first = controllerWithSlowControlLoops();
    const second = controllerWithSlowControlLoops();

    first.shutdown();

    await expect(second.run(() => 'running', Priority.fromValue(0))).resolves.toBe('running');
    second.shutdown();
  });

  test('shutdown cancels queued and new work while allowing active work to finish', async () => {
    const controller = controllerWithSlowControlLoops();
    const blocker = deferred<string>();
    const started = deferred<void>();
    const queuedTask = vi.fn();

    const active = controller.run(async () => {
      started.resolve();
      return blocker.promise;
    }, Priority.fromValue(0));
    await started.promise;
    const queued = controller.run(queuedTask, Priority.fromValue(1));

    controller.shutdown();

    await expect(queued).rejects.toBeInstanceOf(ControllerShutdownError);
    await expect(controller.run(() => undefined)).rejects.toBeInstanceOf(ControllerShutdownError);
    expect(queuedTask).not.toHaveBeenCalled();

    blocker.resolve('finished');
    await expect(active).resolves.toBe('finished');
  });

  test('does not submit work when its signal is already aborted', async () => {
    const controller = controllerWithSlowControlLoops();
    const abortController = new AbortController();
    const task = vi.fn();
    abortController.abort();

    await expect(controller.run(
      task,
      Priority.fromValue(0),
      { signal: abortController.signal },
    )).rejects.toMatchObject({
      name: 'CancelledRequestError',
      requestId: undefined,
      reason: 'requested',
    });
    expect(task).not.toHaveBeenCalled();
    controller.shutdown();
  });

  test('cancels queued work through AbortSignal without affecting active work', async () => {
    const controller = controllerWithSlowControlLoops();
    const blocker = deferred<string>();
    const started = deferred<void>();
    const queuedTask = vi.fn();
    const abortController = new AbortController();

    const active = controller.run(async () => {
      started.resolve();
      return blocker.promise;
    }, Priority.fromValue(0));
    await started.promise;
    const queued = controller.run(
      queuedTask,
      Priority.fromValue(1),
      { signal: abortController.signal },
    );

    abortController.abort();

    await expect(queued).rejects.toBeInstanceOf(CancelledRequestError);
    expect(queuedTask).not.toHaveBeenCalled();
    blocker.resolve('finished');
    await expect(active).resolves.toBe('finished');
    controller.shutdown();
  });

  test('does not interrupt JavaScript work that has already started', async () => {
    const controller = controllerWithSlowControlLoops();
    const blocker = deferred<string>();
    const started = deferred<void>();
    const abortController = new AbortController();

    const active = controller.run(async () => {
      started.resolve();
      return blocker.promise;
    }, Priority.fromValue(0), { signal: abortController.signal });
    await started.promise;

    abortController.abort();
    blocker.resolve('finished');

    await expect(active).resolves.toBe('finished');
    controller.shutdown();
  });

  test('acquires and completes permits while rejecting double completion', async () => {
    const controller = controllerWithSlowControlLoops();

    const successful = await controller.acquire(Priority.fromValue(0));
    successful.complete('success');
    expect(() => successful.complete('failure')).toThrow('Admission permit has already been completed');

    const failed = await controller.acquire(Priority.fromValue(0));
    failed.complete('failure');
    controller.shutdown();
  });

  test('acquires queued permits in priority order', async () => {
    const controller = controllerWithSlowControlLoops();
    const active = await controller.acquire(Priority.fromValue(0));
    const order: string[] = [];

    const lessImportantPromise = controller.acquire(Priority.fromValue(500)).then((permit) => {
      order.push('less-important');
      return permit;
    });
    const moreImportantPromise = controller.acquire(Priority.fromValue(10)).then((permit) => {
      order.push('more-important');
      return permit;
    });

    active.complete('success');
    const moreImportant = await moreImportantPromise;
    expect(order).toEqual(['more-important']);

    moreImportant.complete('success');
    const lessImportant = await lessImportantPromise;
    expect(order).toEqual(['more-important', 'less-important']);

    lessImportant.complete('success');
    controller.shutdown();
  });

  test('translates admission rejections when acquiring permits', async () => {
    const thresholdController = new AdaptiveAdmissionController({ initialThreshold: 1 });
    await expect(thresholdController.acquire(Priority.fromValue(1)))
      .rejects.toBeInstanceOf(ThresholdRejectedError);
    thresholdController.shutdown();

    const queueController = controllerWithSlowControlLoops({ maxQueuedRequests: 0 });
    const active = await queueController.acquire(Priority.fromValue(0));
    await expect(queueController.acquire(Priority.fromValue(1)))
      .rejects.toBeInstanceOf(QueueFullError);
    active.complete('success');
    queueController.shutdown();
  });

  test('evicts a queued permit when its deadline elapses', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      queueTimeoutMs: 10,
      pid: { intervalMs: 10_000 },
    }, runtime.dependencies);

    const activePromise = controller.acquire(Priority.fromValue(0));
    runtime.flushDeferred();
    const active = await activePromise;
    const queued = controller.acquire(Priority.fromValue(1));

    runtime.advanceTo(10n);

    await expect(queued).rejects.toBeInstanceOf(EvictedRequestError);
    active.complete('success');
    controller.shutdown();
  });

  test('observes abort only while a permit remains queued', async () => {
    const controller = controllerWithSlowControlLoops();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();

    await expect(controller.acquire(Priority.fromValue(0), { signal: alreadyAborted.signal }))
      .rejects.toBeInstanceOf(CancelledRequestError);

    const active = await controller.acquire(Priority.fromValue(0));
    const queuedAbort = new AbortController();
    const queued = controller.acquire(Priority.fromValue(1), { signal: queuedAbort.signal });
    queuedAbort.abort();
    await expect(queued).rejects.toBeInstanceOf(CancelledRequestError);

    const acquiredAbort = new AbortController();
    active.complete('success');
    const acquired = await controller.acquire(Priority.fromValue(0), { signal: acquiredAbort.signal });
    acquiredAbort.abort();
    expect(() => acquired.complete('success')).not.toThrow();
    controller.shutdown();
  });

  test('removes a queued abort listener when the permit starts', async () => {
    const controller = controllerWithSlowControlLoops();
    const active = await controller.acquire(Priority.fromValue(0));
    const abortController = new AbortController();
    const removeEventListener = vi.spyOn(abortController.signal, 'removeEventListener');
    const queued = controller.acquire(Priority.fromValue(1), { signal: abortController.signal });

    active.complete('success');
    const permit = await queued;

    expect(removeEventListener).toHaveBeenCalledOnce();
    abortController.abort();
    permit.complete('success');
    controller.shutdown();
  });

  test('shutdown cancels queued acquisitions and allows acquired permits to complete', async () => {
    const controller = controllerWithSlowControlLoops();
    const active = await controller.acquire(Priority.fromValue(0));
    const queued = controller.acquire(Priority.fromValue(1));

    controller.shutdown();

    await expect(queued).rejects.toBeInstanceOf(ControllerShutdownError);
    await expect(controller.acquire()).rejects.toBeInstanceOf(ControllerShutdownError);
    expect(() => active.complete('success')).not.toThrow();
  });

  test('publishes threshold changes to diagnostic listeners', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      queueTimeoutMs: 10_000,
      pid: { intervalMs: 10 },
      statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
    }, runtime.dependencies);
    const diagnostics: ControllerDiagnosticEvent[] = [];
    controller.onDiagnostic((event) => diagnostics.push(event));
    const blocker = deferred<void>();

    const active = controller.run(() => blocker.promise, Priority.fromValue(0));
    runtime.flushDeferred();
    const queued = controller.run(() => undefined, Priority.fromValue(1));
    runtime.advanceTo(10n);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      type: 'threshold-changed',
      previous: 768,
      current: expect.any(Number),
    }));
    const thresholdChange = diagnostics.find((event) => event.type === 'threshold-changed');
    expect(thresholdChange?.current).toBeLessThan(768);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      type: 'controller-diagnostics',
      diagnostics: expect.objectContaining({ threshold: thresholdChange?.current }),
    }));

    controller.shutdown();
    blocker.resolve();
    await active;
    await expect(queued).rejects.toBeInstanceOf(ControllerShutdownError);
  });

  test('publishes each statistics snapshot once', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      pid: { intervalMs: 10_000 },
      statistics: {
        minWindowMs: 10,
        maxWindowMs: 20,
        minSamples: 1,
        minPercentileSamples: 1,
        maxSamples: 10,
      },
    }, runtime.dependencies);
    const diagnostics: ControllerDiagnosticEvent[] = [];
    controller.onDiagnostic((event) => diagnostics.push(event));

    const request = controller.run(() => undefined, Priority.fromValue(0));
    runtime.flushDeferred();
    await request;
    runtime.advanceTo(10n);
    controller.run(() => undefined, Priority.fromValue(0));

    const snapshots = diagnostics.filter((event) => event.type === 'statistics-published');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      type: 'statistics-published',
      snapshot: { id: 0n, successfulRequests: 1n },
    });

    controller.shutdown();
    runtime.flushDeferred();
  });

  test('diagnostic listener failures do not change task outcomes', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      pid: { intervalMs: 10 },
      statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
    }, runtime.dependencies);
    controller.onDiagnostic(() => {
      throw new Error('diagnostic consumer failed');
    });
    const blocker = deferred<void>();

    const active = controller.run(() => blocker.promise, Priority.fromValue(0));
    runtime.flushDeferred();
    const queued = controller.run(() => 'queued', Priority.fromValue(1));
    runtime.advanceTo(10n);
    blocker.resolve();
    runtime.flushDeferred();

    await expect(active).resolves.toBeUndefined();
    runtime.flushDeferred();
    await expect(queued).resolves.toBe('queued');
    controller.shutdown();
  });

  test('publishes initial and changed adaptive controller diagnostics', async () => {
    const runtime = new FakeRuntime();
    const controller = new AdaptiveAdmissionController({
      maxConcurrentRequests: 1,
      queueTimeoutMs: 500,
      queueTimeoutRatio: 0.5,
      pid: { intervalMs: 10_000 },
      statistics: {
        minWindowMs: 10,
        maxWindowMs: 20,
        minSamples: 1,
        minPercentileSamples: 1,
        maxSamples: 10,
      },
    }, runtime.dependencies);
    const diagnostics: ControllerDiagnosticEvent[] = [];
    controller.onDiagnostic((event) => diagnostics.push(event));
    const blocker = deferred<void>();
    const started = deferred<void>();

    const active = controller.run(async () => {
      started.resolve();
      await blocker.promise;
    }, Priority.fromValue(0));
    runtime.flushDeferred();
    await started.promise;

    const initial = diagnostics.find((event) => event.type === 'controller-diagnostics');
    expect(initial).toMatchObject({
      type: 'controller-diagnostics',
      diagnostics: {
        threshold: 768,
        concurrencyLimit: 1n,
        queueTimeoutMs: 500n,
        targetLatencyMs: 100,
      },
    });

    runtime.advanceTo(10n);
    blocker.resolve();
    await active;
    runtime.advanceTo(20n);
    runtime.advanceTo(2_010n);

    const snapshots = diagnostics.filter((event) => event.type === 'controller-diagnostics');
    expect(snapshots.some((event) => event.type === 'controller-diagnostics'
      && event.diagnostics.queueTimeoutMs === 5n)).toBe(true);
    expect(snapshots.some((event) => event.type === 'controller-diagnostics'
      && event.diagnostics.aggregatedLatencyMs !== undefined)).toBe(true);

    controller.shutdown();
  });
});

function controllerWithSlowControlLoops(overrides: { maxQueuedRequests?: number } = {}): AdaptiveAdmissionController {
  return new AdaptiveAdmissionController({
    maxConcurrentRequests: 1,
    queueTimeoutMs: 10_000,
    pid: { intervalMs: 10_000 },
    statistics: { minWindowMs: 10_000, maxWindowMs: 20_000 },
    ...overrides,
  });
}

class FakeScheduler implements DeadlineScheduler {
  private nextId = 0;
  private readonly callbacks = new Map<number, { callback: () => void; delay: number }>();
  private lastCallback: (() => void) | undefined;

  schedule(callback: () => void, delayMilliseconds: number): unknown {
    const id = this.nextId++;
    this.callbacks.set(id, { callback, delay: delayMilliseconds });
    this.lastCallback = callback;
    return id;
  }

  cancel(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  get activeCount(): number {
    return this.callbacks.size;
  }

  get latestCallback(): () => void {
    if (!this.lastCallback) {
      throw new Error('no scheduled deadline');
    }
    return this.lastCallback;
  }

  runNext(): void {
    const next = [...this.callbacks.entries()].sort((left, right) => left[1].delay - right[1].delay)[0];
    if (!next) {
      throw new Error('no scheduled deadline');
    }
    this.callbacks.delete(next[0]);
    next[1].callback();
  }
}

class FakeRuntime {
  private now = 0n;
  private readonly deferred: Array<() => void> = [];
  readonly scheduler = new FakeScheduler();
  readonly dependencies: ControllerDependencies = {
    clock: { nowMilliseconds: () => this.now },
    scheduler: this.scheduler,
    defer: (callback) => this.deferred.push(callback),
  };

  flushDeferred(): void {
    while (this.deferred.length > 0) {
      this.deferred.shift()!();
    }
  }

  advanceTo(now: bigint): void {
    this.now = now;
    this.scheduler.runNext();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
