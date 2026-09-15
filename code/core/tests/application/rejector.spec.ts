import { beforeEach, describe, expect, test, vi, type Mocked } from 'vitest';

import { PidController } from '../../src/application/pid-controller';
import { Rejector } from '../../src/application/rejector';
import { IntervalManager } from '../../src/core/shutdown/interval-manager';
import { Event } from '../../src/domain/events';
import { RejectedRequestException } from '../../src/domain/exceptions/rejected-request.exception';
import { Priority } from '../../src/domain/priority';
import { PriorityQueue } from '../../src/domain/priority-queue/priority-queue';
import { Request } from '../../src/domain/request';
import { Statistics } from '../../src/domain/statistics/statistics';

vi.mock('../../src/core/logging/logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Rejector', () => {
  let priorityQueue: Mocked<PriorityQueue>;
  let statistics: Mocked<Statistics>;
  let pidController: Mocked<PidController>;
  let intervals: Mocked<IntervalManager>;
  let rejector: Rejector;

  beforeEach(() => {
    vi.useFakeTimers();
    priorityQueue = {
      add: vi.fn(),
      getSecondsSinceLastEmpty: vi.fn().mockReturnValue(0),
    } as unknown as Mocked<PriorityQueue>;
    statistics = {
      add: vi.fn(),
      calculateCumulativePriorityDistribution: vi.fn(),
    } as unknown as Mocked<Statistics>;
    pidController = {
      updateThreshold: vi.fn().mockReturnValue(100),
    } as unknown as Mocked<PidController>;
    intervals = {
      add: vi.fn(),
    } as unknown as Mocked<IntervalManager>;
    rejector = new Rejector(priorityQueue, statistics, pidController, 768, 1_000, intervals);
  });

  test('records and queues an accepted request in lifecycle order', () => {
    const request = createRequest(10);
    priorityQueue.add.mockImplementation((queued) => {
      expect(queued.status).toBe(Event.QUEUED);
    });

    rejector.process(request);

    expect(statistics.add).toHaveBeenCalledWith(request);
    expect(priorityQueue.add).toHaveBeenCalledWith(request);
    expect(request.status).toBe(Event.QUEUED);
  });

  test('rejects a request whose priority equals the exclusive threshold', async () => {
    const request = createRequest(100);
    rejector.updateThreshold(100);

    expect(() => rejector.process(request)).toThrow(RejectedRequestException);

    await expect(request.promise).rejects.toBeInstanceOf(RejectedRequestException);
    expect(statistics.add).toHaveBeenCalledWith(request);
    expect(priorityQueue.add).not.toHaveBeenCalled();
    expect(request.status).toBe(Event.REJECTED);
  });

  test('converts an intermediate percentile to an exclusive threshold', () => {
    priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(11);
    pidController.updateThreshold.mockReturnValue(50);
    statistics.calculateCumulativePriorityDistribution.mockReturnValue(400);

    vi.advanceTimersByTime(1_000);

    expect(statistics.calculateCumulativePriorityDistribution).toHaveBeenCalledWith(50);
    expect(rejector['threshold']).toBe(401);
  });

  test.each([
    { percentage: 0, expected: 0 },
    { percentage: 100, expected: Priority.ALLOW_ALL_THRESHOLD },
  ])('maps $percentage percent to threshold $expected', ({ percentage, expected }) => {
    priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(11);
    pidController.updateThreshold.mockReturnValue(percentage);

    vi.advanceTimersByTime(1_000);

    expect(rejector['threshold']).toBe(expected);
    expect(statistics.calculateCumulativePriorityDistribution).not.toHaveBeenCalled();
  });

  test('falls back to linear recovery when percentile statistics fail', () => {
    priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(11);
    pidController.updateThreshold.mockReturnValue(50);
    statistics.calculateCumulativePriorityDistribution.mockImplementation(() => {
      throw new Error('statistics failed');
    });

    vi.advanceTimersByTime(1_000);

    expect(rejector['threshold']).toBe(384);
  });

  test('uses linear recovery while the queue is not persistently overloaded', () => {
    pidController.updateThreshold.mockReturnValue(50);

    vi.advanceTimersByTime(1_000);

    expect(rejector['threshold']).toBe(384);
    expect(statistics.calculateCumulativePriorityDistribution).not.toHaveBeenCalled();
  });

  test('ignores non-finite PID output', () => {
    pidController.updateThreshold.mockReturnValue(Number.NaN);

    vi.advanceTimersByTime(1_000);

    expect(rejector['threshold']).toBe(768);
  });

  test('registers its interval with the injected owner', () => {
    expect(intervals.add).toHaveBeenCalledTimes(1);
  });

  function createRequest(priority: number): Request {
    return new Request(() => undefined, Priority.fromValue(priority));
  }
});
