import { EventEmitter } from 'events';
import { beforeEach, describe, expect, test, vi, type Mocked } from 'vitest';

import { Executor } from '../../src/application/executor';
import { Scheduler } from '../../src/application/scheduler';
import { Event } from '../../src/domain/events';
import { ControllerShutdownException } from '../../src/domain/exceptions/controller-shutdown.exception';
import { Priority } from '../../src/domain/priority';
import { PriorityQueue } from '../../src/domain/priority-queue/priority-queue';
import { Request } from '../../src/domain/request';
import { Statistics } from '../../src/domain/statistics/statistics';

vi.mock('../../src/core/logging/logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Scheduler', () => {
  let emitter: EventEmitter;
  let queue: Mocked<PriorityQueue>;
  let executor: Mocked<Executor>;
  let statistics: Mocked<Statistics>;
  let scheduler: Scheduler;

  beforeEach(() => {
    emitter = new EventEmitter();
    queue = {
      on: vi.fn((event, listener) => {
        emitter.on(event, listener);
        return queue;
      }),
      off: vi.fn((event, listener) => {
        emitter.off(event, listener);
        return queue;
      }),
      poll: vi.fn(),
      cancelAll: vi.fn(),
      length: 0,
    } as unknown as Mocked<PriorityQueue>;
    executor = {
      concurrency: 2,
      add: vi.fn(),
    } as unknown as Mocked<Executor>;
    statistics = {
      recordSuccessful: vi.fn(),
    } as unknown as Mocked<Statistics>;
    scheduler = new Scheduler(queue, executor, statistics);
  });

  test('start is idempotent and listens for newly queued requests', () => {
    scheduler.start();
    scheduler.start();

    expect(queue.on).toHaveBeenCalledTimes(1);

    const request = queuedRequest();
    (queue as any).length = 1;
    queue.poll.mockReturnValueOnce(request).mockReturnValue(null);
    emitter.emit('requestAdded');

    expect(executor.add).toHaveBeenCalledTimes(1);
    expect(request.status).toBe(Event.LAUNCHED);
  });

  test('starts processing requests that were already queued', () => {
    const request = queuedRequest();
    (queue as any).length = 1;
    queue.poll.mockReturnValueOnce(request).mockReturnValue(null);

    scheduler.start();

    expect(executor.add).toHaveBeenCalledTimes(1);
    expect(request.status).toBe(Event.LAUNCHED);
  });

  test('records a successful execution before resolving its promise', async () => {
    const request = queuedRequest(() => Promise.resolve('result'));
    let execution: Promise<unknown> | undefined;
    executor.add.mockImplementation((task: any) => {
      execution = task();
      return execution as any;
    });
    (queue as any).length = 1;
    queue.poll.mockReturnValueOnce(request).mockReturnValue(null);

    scheduler.start();
    await execution;

    await expect(request.promise).resolves.toBe('result');
    expect(request.status).toBe(Event.COMPLETED);
    expect(statistics.recordSuccessful).toHaveBeenCalledWith(request);
    expect(scheduler.processingRequests).toBe(0);
  });

  test('marks failed executions and rejects their promises', async () => {
    const error = new Error('failed');
    const request = queuedRequest(() => Promise.reject(error));
    let execution: Promise<unknown> | undefined;
    executor.add.mockImplementation((task: any) => {
      execution = task();
      return execution as any;
    });
    (queue as any).length = 1;
    queue.poll.mockReturnValueOnce(request).mockReturnValue(null);

    scheduler.start();
    await execution;

    await expect(request.promise).rejects.toBe(error);
    expect(request.status).toBe(Event.FAILED);
    expect(statistics.recordSuccessful).not.toHaveBeenCalled();
    expect(scheduler.processingRequests).toBe(0);
  });

  test('releases capacity when executor submission fails synchronously', async () => {
    const error = new Error('submission failed');
    const request = queuedRequest();
    executor.add.mockImplementation(() => {
      throw error;
    });
    (queue as any).length = 1;
    queue.poll.mockReturnValueOnce(request).mockReturnValue(null);

    scheduler.start();

    await expect(request.promise).rejects.toBe(error);
    expect(request.status).toBe(Event.FAILED);
    expect(scheduler.processingRequests).toBe(0);
  });

  test('does not launch beyond the effective concurrency', () => {
    const requests = [queuedRequest(), queuedRequest(), queuedRequest()];
    (queue as any).length = requests.length;
    queue.poll.mockImplementation(() => requests.shift() ?? null);

    scheduler.start();

    expect(executor.add).toHaveBeenCalledTimes(2);
    expect(scheduler.processingRequests).toBe(2);
  });

  test('updates both scheduler and executor concurrency', () => {
    scheduler.start();

    scheduler.updateMaxConcurrentRequests(5);

    expect(scheduler.maxConcurrentRequests).toBe(5);
    expect(executor.concurrency).toBe(5);
  });

  test('reports each observed inflight peak once', () => {
    const requests = [queuedRequest(), queuedRequest()];
    (queue as any).length = requests.length;
    queue.poll.mockImplementation(() => requests.shift() ?? null);

    scheduler.start();

    expect(scheduler.consumeMaxObservedConcurrentRequests()).toBe(2);
    expect(scheduler.consumeMaxObservedConcurrentRequests()).toBe(2);
  });

  test('terminate removes only its listener and cancels queued work', () => {
    const unrelatedListener = vi.fn();
    emitter.on('requestAdded', unrelatedListener);
    scheduler.start();
    queue.poll.mockClear();
    const reason = new ControllerShutdownException();

    scheduler.terminate(reason);
    emitter.emit('requestAdded');

    expect(queue.off).toHaveBeenCalledWith('requestAdded', expect.any(Function));
    expect(queue.cancelAll).toHaveBeenCalledWith(reason);
    expect(queue.poll).not.toHaveBeenCalled();
    expect(unrelatedListener).toHaveBeenCalledTimes(1);
  });

  function queuedRequest(task: () => unknown = () => undefined): Request {
    const request = new Request(task, new Priority(0));
    request.transitionTo(Event.QUEUED);
    return request;
  }
});
