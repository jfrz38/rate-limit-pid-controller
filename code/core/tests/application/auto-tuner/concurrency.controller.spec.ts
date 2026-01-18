import { vi, describe, expect, beforeEach, MockInstance, Mocked } from 'vitest';

import os from 'os';
import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";
import { Scheduler } from "../../../src/application/scheduler";
import { DefaultOptions } from "../../../src/default-parameters";
import { Statistics } from "../../../src/domain/statistics/statistics";
import { ControllerHistory } from '../../../src/application/auto-tuner/controller-history';
import { NotEnoughStatsException } from '../../../src/domain/exceptions/not-enough-stats.exception';

vi.mock("../../../src/core/logging/logger", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn()
  }),
}));

describe('ConcurrencyController', () => {
  let scheduler: Mocked<Scheduler>;
  let statistics: Mocked<Statistics>;
  let latencyController: Mocked<LatencyController>;
  let controller: ConcurrencyController;
  let history: ControllerHistory;
  let cpuSpy: MockInstance;
  const mockedCpus = 4;

  const cores = DefaultOptions.values.capacity.cores;

  beforeEach(() => {
    cpuSpy = vi.spyOn(os, 'cpus').mockImplementation(() => new Array(mockedCpus));
    scheduler = { updateMaxConcurrentRequests: vi.fn() } as unknown as Mocked<Scheduler>;
    statistics = {
      getPercentileLatencySuccessfulRequests: vi.fn(),
      getThroughputForInterval: vi.fn(),
      getSuccessfulThroughput: vi.fn(),
    } as unknown as Mocked<Statistics>;

    latencyController = {
      targetLatency: 100
    } as Mocked<LatencyController>;

    history = {
      push: vi.fn(),
      intervalThroughputs: [],
      maxInflights: [],
      length: 0
    } as unknown as Mocked<ControllerHistory>;

    controller = new ConcurrencyController(
      scheduler,
      statistics,
      latencyController,
      history,
      cores
    );
  });

  afterEach(() => {
    cpuSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('Test initialization', () => {

    test.each([
      { cores: 2, expectedCores: 2 },
      { cores: 1, expectedCores: 1 },
      { cores: 0, expectedCores: 1 },
      { cores: -1, expectedCores: 1 },
      { cores: 10, expectedCores: 4 },
    ])("when cores is $cores should initialize with $expectedCores", ({ cores, expectedCores }) => {
      controller = new ConcurrencyController(
        scheduler,
        statistics,
        latencyController,
        history,
        cores
      );

      expect((controller as any).cores).toBe(expectedCores);
    });
  });

  describe('Test when update', () => {
    test('should not update inflightLimit if not enough stats', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockImplementation(() => {
        throw new NotEnoughStatsException('Not enough stats');
      });

      controller.update();

      expect(statistics.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
      expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalledTimes(1);
    });

    test('should not update inflightLimit if any error is thrown', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockImplementation(() => {
        throw new Error('other error');
      });

      controller.update();

      expect(statistics.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
      expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalledTimes(1);
    });

    test('should calculate new limit, apply it and save to history', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(150);
      statistics.getSuccessfulThroughput.mockReturnValue(20);

      controller.update();

      expect(statistics.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
      expect(statistics.getSuccessfulThroughput).toHaveBeenCalledTimes(1);
      expect(history.push).toHaveBeenCalledTimes(1);

      const newLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(typeof newLimit).toBe('number');
    });

    test('should respect lower bound (cores)', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(1);
      statistics.getSuccessfulThroughput.mockReturnValue(20);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBeGreaterThanOrEqual(require('os').cpus().length);
    });

    test('should respect upper bound (inflightLimit * 10)', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(0.1);
      statistics.getSuccessfulThroughput.mockReturnValue(50);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBeLessThanOrEqual(10 * 10); // inflightLimit * 10
    });

    test('should decrease queue when above beta in calculateNewLimit', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(250);
      statistics.getSuccessfulThroughput.mockReturnValue(20);

      const spy = vi.spyOn(controller as any, 'applyNewLimit');

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(controller['inflightLimit']);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('should enforce lower bound when queue lower cores', () => {
      const cores = -1;
      (controller as any).cores = cores;

      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(10_000);
      statistics.getSuccessfulThroughput.mockReturnValue(5);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(controller['inflightLimit']);
      expect(controller['inflightLimit']).toBeGreaterThan(cores);
    });

    test('should enforce lower bound when queue equal to cores', () => {
      const cores = 9;
      (controller as any).cores = cores;

      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(10_000);
      statistics.getSuccessfulThroughput.mockReturnValue(5);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(controller['inflightLimit']);
      expect(controller['inflightLimit']).toBe(cores);
    });

    test('should cap newLimit when queue > inflightLimit * 10', () => {
      const cores = -1;
      (controller as any).cores = cores;
      controller['inflightLimit'] = -1;

      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(10_000);
      statistics.getSuccessfulThroughput.mockReturnValue(5);


      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(-10);
      expect(controller['inflightLimit']).toBe(-10);
    });
  });

  describe('Test when applyNewLimit', () => {
    test('when apply a new limit should call expected methods', () => {
      const currentLimit = controller['inflightLimit'];
      const newLimit = currentLimit + 1;

      (controller as any).applyNewLimit(newLimit);

      expect(scheduler.updateMaxConcurrentRequests).toHaveBeenNthCalledWith(1, newLimit);
      expect(controller['inflightLimit']).toBe(newLimit);
    });

    test('when apply a new limit and no change should not call any method', () => {
      const limit = controller['inflightLimit'];

      (controller as any).applyNewLimit(limit);

      expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalled();
      expect(controller['inflightLimit']).toBe(limit);
    });
  });

});

