import { beforeEach, describe, expect, test, vi, type Mocked } from 'vitest';

import { ConcurrencyController } from '../../../src/application/auto-tuner/concurrency.controller';
import { ControllerHistory } from '../../../src/application/auto-tuner/controller-history';
import { LatencyController } from '../../../src/application/auto-tuner/latency.controller';
import { Scheduler } from '../../../src/application/scheduler';
import { Statistics, type StatisticsSnapshot } from '../../../src/domain/statistics/statistics';

vi.mock('../../../src/core/logging/logger', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const snapshot = (overrides: Partial<StatisticsSnapshot> = {}): StatisticsSnapshot => ({
  id: 1,
  percentileLatency: 120,
  minimumLatency: 50,
  averageLatency: 80,
  successfulRequests: 100,
  throughputPerSecond: 50,
  ...overrides,
});

describe('ConcurrencyController', () => {
  let scheduler: Mocked<Scheduler>;
  let statistics: Mocked<Statistics>;
  let latencyController: Mocked<LatencyController>;
  let history: Mocked<ControllerHistory>;
  let controller: ConcurrencyController;

  beforeEach(() => {
    scheduler = {
      updateMaxConcurrentRequests: vi.fn(),
      maxConcurrentRequests: 10,
      processingRequests: 5,
      consumeMaxObservedConcurrentRequests: vi.fn().mockReturnValue(8),
    } as unknown as Mocked<Scheduler>;
    statistics = {
      takeSnapshot: vi.fn(),
    } as unknown as Mocked<Statistics>;
    latencyController = {
      targetLatency: 100,
      aggregate: vi.fn().mockImplementation((value) => value),
      reset: vi.fn(),
    } as unknown as Mocked<LatencyController>;
    history = {
      push: vi.fn(),
      intervalThroughputs: [],
      maxInflights: [],
      length: 0,
    } as unknown as Mocked<ControllerHistory>;

    controller = new ConcurrencyController(scheduler, statistics, latencyController, history);
  });

  test('starts from the scheduler effective concurrency', () => {
    expect(controller['inflightLimit']).toBe(10);
    expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalled();
  });

  test('retains the observed peak until an execution bucket closes', () => {
    statistics.takeSnapshot.mockReturnValueOnce(undefined).mockReturnValueOnce(snapshot());
    scheduler.consumeMaxObservedConcurrentRequests
      .mockReturnValueOnce(8)
      .mockReturnValueOnce(6);

    controller.update();
    controller.update();

    expect(history.push).toHaveBeenCalledWith(8, 50);
    expect(latencyController.aggregate).toHaveBeenCalledWith(120);
  });

  test('discards the observed peak when an undersized bucket expires', () => {
    statistics.takeSnapshot.mockReturnValueOnce(null).mockReturnValueOnce(snapshot());
    scheduler.consumeMaxObservedConcurrentRequests
      .mockReturnValueOnce(8)
      .mockReturnValueOnce(6);

    controller.update();
    controller.update();

    expect(history.push).toHaveBeenCalledWith(6, 50);
  });

  test('uses one coherent snapshot to update history and concurrency', () => {
    statistics.takeSnapshot.mockReturnValue(snapshot({ percentileLatency: 250, throughputPerSecond: 40 }));

    controller.update();

    expect(history.push).toHaveBeenCalledWith(8, 40);
    expect(latencyController.aggregate).toHaveBeenCalledWith(250);
    expect(scheduler.updateMaxConcurrentRequests).toHaveBeenCalledWith(9);
  });

  test('never reduces concurrency below one', () => {
    (scheduler as any).maxConcurrentRequests = 1;
    controller = new ConcurrencyController(scheduler, statistics, latencyController, history);
    statistics.takeSnapshot.mockReturnValue(snapshot({ percentileLatency: 10_000 }));
    latencyController.aggregate.mockReturnValue(10_000);

    controller.update();

    expect(controller['inflightLimit']).toBe(1);
    expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalled();
  });

  test('limits growth to ten times the observed inflight peak', () => {
    (scheduler as any).maxConcurrentRequests = 100;
    (scheduler as any).processingRequests = 0;
    scheduler.consumeMaxObservedConcurrentRequests.mockReturnValue(1);
    controller = new ConcurrencyController(scheduler, statistics, latencyController, history);
    statistics.takeSnapshot.mockReturnValue(snapshot({ percentileLatency: 1 }));
    latencyController.aggregate.mockReturnValue(1);

    controller.update();

    expect(scheduler.updateMaxConcurrentRequests).toHaveBeenCalledWith(10);
  });

  test('probes concurrency two after three closed buckets at the lower bound', () => {
    (scheduler as any).maxConcurrentRequests = 1;
    controller = new ConcurrencyController(scheduler, statistics, latencyController, history);
    statistics.takeSnapshot
      .mockReturnValueOnce(snapshot({ id: 1, percentileLatency: 10_000 }))
      .mockReturnValueOnce(snapshot({ id: 2, percentileLatency: 10_000 }))
      .mockReturnValueOnce(snapshot({ id: 3, percentileLatency: 10_000 }));
    latencyController.aggregate.mockReturnValue(10_000);

    controller.update();
    controller.update();
    controller.update();

    expect(latencyController.reset).toHaveBeenCalledWith(10_000, 3);
    expect(scheduler.updateMaxConcurrentRequests).toHaveBeenCalledWith(2);
    expect(controller['inflightLimit']).toBe(2);
  });

  test('can grow after the lower-bound probe and reduce on later degradation', () => {
    (scheduler as any).maxConcurrentRequests = 1;
    (latencyController as any).targetLatency = 100;
    latencyController.reset.mockImplementation((targetLatency) => {
      (latencyController as any).targetLatency = targetLatency;
    });
    controller = new ConcurrencyController(scheduler, statistics, latencyController, history);
    statistics.takeSnapshot
      .mockReturnValueOnce(snapshot({ id: 1 }))
      .mockReturnValueOnce(snapshot({ id: 2 }))
      .mockReturnValueOnce(snapshot({ id: 3 }))
      .mockReturnValueOnce(snapshot({ id: 4 }))
      .mockReturnValueOnce(snapshot({ id: 5 }));
    latencyController.aggregate
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(10_000);

    controller.update();
    controller.update();
    controller.update();
    controller.update();
    controller.update();

    expect(scheduler.updateMaxConcurrentRequests.mock.calls.map(([limit]) => limit)).toEqual([2, 3, 2]);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores a non-finite calculated limit: %s',
    (newLimit) => {
      controller['applyNewLimit'](newLimit);

      expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalled();
      expect(controller['inflightLimit']).toBe(10);
    },
  );
});
