import { describe, expect, test, vi } from 'vitest';

import { ControllerShutdownException } from '../src/domain/exceptions/controller-shutdown.exception';
import { Priority } from '../src/domain/priority';
import { PidControllerRateLimit } from '../src/pid-controller-rate-limit';

describe('PidControllerRateLimit integration', () => {
  test('returns successful task values and propagates task failures', async () => {
    const controller = createController();
    const error = new Error('task failed');

    try {
      await expect(controller.run(() => 42)).resolves.toBe(42);
      await expect(controller.run(() => Promise.reject(error))).rejects.toBe(error);
    } finally {
      controller.shutdown();
    }
  });

  test('executes queued work by priority once capacity is available', async () => {
    const controller = createController();
    const blocker = deferred<void>();
    const started = deferred<void>();
    const executionOrder: string[] = [];

    try {
      const blockingRun = controller.run(async () => {
        executionOrder.push('blocking');
        started.resolve();
        await blocker.promise;
      });
      await started.promise;

      const lessImportant = controller.run(() => executionOrder.push('less-important'), Priority.fromValue(500));
      const moreImportant = controller.run(() => executionOrder.push('more-important'), Priority.fromValue(10));

      blocker.resolve();
      await Promise.all([blockingRun, lessImportant, moreImportant]);

      expect(executionOrder).toEqual(['blocking', 'more-important', 'less-important']);
    } finally {
      controller.shutdown();
    }
  });

  test('shutdown rejects queued and new work while allowing inflight work to finish', async () => {
    const controller = createController();
    const blocker = deferred<void>();
    const started = deferred<void>();
    const queuedTask = vi.fn();

    const inflight = controller.run(async () => {
      started.resolve();
      await blocker.promise;
      return 'finished';
    });
    await started.promise;
    const queued = controller.run(queuedTask);

    controller.shutdown();

    await expect(queued).rejects.toBeInstanceOf(ControllerShutdownException);
    await expect(controller.run(() => undefined)).rejects.toBeInstanceOf(ControllerShutdownException);
    expect(queuedTask).not.toHaveBeenCalled();

    blocker.resolve();
    await expect(inflight).resolves.toBe('finished');
  });

  test('shutting down one instance leaves another instance timers active', () => {
    const first = createController();
    const second = createController();
    const firstIntervals = (first as any).intervalManager.intervals as Set<NodeJS.Timeout>;
    const secondIntervals = (second as any).intervalManager.intervals as Set<NodeJS.Timeout>;

    expect(firstIntervals.size).toBe(4);
    expect(secondIntervals.size).toBe(4);

    first.shutdown();

    expect(firstIntervals.size).toBe(0);
    expect(secondIntervals.size).toBe(4);
    second.shutdown();
  });

  test('publishes a coherent bucket under synthetic load and feeds the tuner', async () => {
    const controller = createController({
      capacity: { maxConcurrentRequests: 4 },
      statistics: {
        minRequestsForStats: 5,
        minRequestsForLatencyPercentile: 20,
        latencyPercentile: 90,
      },
      interval: {
        maxRequests: 100,
        requestInterval: {
          minIntervalTime: 0.01,
          maxIntervalTime: 5,
        },
      },
    });

    try {
      await Promise.all(Array.from({ length: 20 }, () => controller.run(
        () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
      )));

      await waitUntil(() => (controller as any).controllerHistory.length === 1, 3_000);

      const snapshot = (controller as any).statistics.getLatestSnapshot();
      expect(snapshot.successfulRequests).toBe(20);
      expect(snapshot.percentileLatency).toBeGreaterThan(0);
      expect(snapshot.throughputPerSecond).toBeGreaterThan(0);
      expect((controller as any).controllerHistory.maxInflights).toEqual([4]);
    } finally {
      controller.shutdown();
    }
  }, 5_000);
});

function createController(overrides: Record<string, unknown> = {}): PidControllerRateLimit {
  return new PidControllerRateLimit({
    capacity: {
      maxConcurrentRequests: 1,
    },
    timeout: {
      priorityQueue: {
        value: 5_000,
        ratio: 0.33,
      },
    },
    ...overrides,
  });
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

async function waitUntil(condition: () => boolean, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
