import { describe, expect, test, vi } from 'vitest';

import {
  AdaptiveAdmissionController,
  ControllerShutdownError,
  EvictedRequestError,
  Priority,
  QueueFullError,
  ThresholdRejectedError,
} from '../src/index.js';
import type { ControllerDependencies, DeadlineScheduler } from '../src/controller.js';

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
