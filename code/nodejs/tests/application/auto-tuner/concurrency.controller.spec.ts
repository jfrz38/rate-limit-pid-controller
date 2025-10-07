import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";
import { Scheduler } from "../../../src/application/scheduler";
import { Statistics } from "../../../src/application/statistics";
import logger from "../../../src/core/logging/logger";

describe('ConcurrencyController', () => {
  let scheduler: jest.Mocked<Scheduler>;
  let statistics: jest.Mocked<Statistics>;
  let latencyController: jest.Mocked<LatencyController>;
  let controller: ConcurrencyController;

  beforeEach(() => {
    scheduler = { updateMaxConcurrentRequests: jest.fn() } as unknown as jest.Mocked<Scheduler>;
    statistics = {
      getPercentileLatencySuccessfulRequests: jest.fn(),
      getThroughputForInterval: jest.fn(),
    } as unknown as jest.Mocked<Statistics>;

    latencyController = {
      targetLatency: 100
    } as jest.Mocked<LatencyController>;

    controller = new ConcurrencyController(
      scheduler,
      statistics,
      latencyController,
    );

    // Silence logger.info
    jest.spyOn(logger, 'info').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Test when update', () => {
    test('should not update inflightLimit if not enough stats', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockImplementation(() => {
        throw new Error('Not enough stats');
      });

      controller.update();

      expect(statistics.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
      expect(scheduler.updateMaxConcurrentRequests).not.toHaveBeenCalledTimes(1);
    });

    test('should calculate new limit and apply it', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(150);
      statistics.getThroughputForInterval.mockReturnValue(20);

      controller.update();

      expect(statistics.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
      expect(statistics.getThroughputForInterval).toHaveBeenCalledTimes(1);

      const newLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(typeof newLimit).toBe('number');
    });

    test('should respect lower bound (cores)', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(1);
      statistics.getThroughputForInterval.mockReturnValue(20);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBeGreaterThanOrEqual(require('os').cpus().length);
    });

    test('should respect upper bound (inflightLimit * 10)', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(0.1);
      statistics.getThroughputForInterval.mockReturnValue(50);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBeLessThanOrEqual(10 * 10); // inflightLimit * 10
    });

    test('should remove oldest element when intervalThroughput exceeds max size', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(150);
      statistics.getThroughputForInterval.mockReturnValue(1);

      for (let i = 0; i < 50; i++) {
        controller['pushFixed'](controller['intervalThroughput'], i, 50);
      }

      controller.update();

      expect(controller['intervalThroughput'].length).toBe(50);
      expect(controller['intervalThroughput'][0]).toBe(1);
    });

    test('should decrease queue when above beta in calculateNewLimit', () => {
      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(250);
      statistics.getThroughputForInterval.mockReturnValue(20);

      const spy = jest.spyOn(controller as any, 'applyNewLimit');

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(controller['inflightLimit']);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('should enforce lower bound when queue lower cores', () => {
      const cores = -1;
      (controller as any).cores = cores;

      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(10_000);
      statistics.getThroughputForInterval.mockReturnValue(5);

      controller.update();

      const appliedLimit = scheduler.updateMaxConcurrentRequests.mock.calls[0][0];
      expect(appliedLimit).toBe(controller['inflightLimit']);
      expect(controller['inflightLimit']).toBeGreaterThan(cores);
    });

    test('should enforce lower bound when queue equal to cores', () => {
      const cores = 9;
      (controller as any).cores = cores;

      statistics.getPercentileLatencySuccessfulRequests.mockReturnValue(10_000);
      statistics.getThroughputForInterval.mockReturnValue(5);

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
      statistics.getThroughputForInterval.mockReturnValue(5);


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

      expect(scheduler.updateMaxConcurrentRequests).toHaveBeenNthCalledWith(1, newLimit)
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

