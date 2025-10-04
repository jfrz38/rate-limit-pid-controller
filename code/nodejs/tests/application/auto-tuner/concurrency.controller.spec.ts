import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";
import { Scheduler } from "../../../src/application/scheduler";
import { Statistics } from "../../../src/application/statistics";

describe('ConcurrencyController', () => {
  let schedulerMock: jest.Mocked<Scheduler>;
  let statisticsMock: jest.Mocked<Statistics>;
  let latencyControllerMock: LatencyController;
  let controller: ConcurrencyController;

  beforeEach(() => {
    schedulerMock = { updateMaxConcurrentRequests: jest.fn() } as unknown as jest.Mocked<Scheduler>;
    statisticsMock = {
      getPercentileLatencySuccessfulRequests: jest.fn(),
      getThroughputForInterval: jest.fn(),
    } as unknown as jest.Mocked<Statistics>;

    latencyControllerMock = {} as LatencyController;
    Object.defineProperty(latencyControllerMock, 'targetLatency', {
      get: () => 100,
    });

    controller = new ConcurrencyController(
      schedulerMock,
      statisticsMock,
      latencyControllerMock,
    );

    // Silence console.info
    jest.spyOn(console, 'info').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should not update inflightLimit if not enough stats', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockImplementation(() => {
      throw new Error('Not enough stats');
    });

    controller.update();

    expect(statisticsMock.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
    expect(schedulerMock.updateMaxConcurrentRequests).not.toHaveBeenCalledTimes(1);
  });

  test('should calculate new limit and apply it', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockReturnValue(150);
    statisticsMock.getThroughputForInterval.mockReturnValue(20);

    controller.update();

    expect(statisticsMock.getPercentileLatencySuccessfulRequests).toHaveBeenCalledTimes(1);
    expect(statisticsMock.getThroughputForInterval).toHaveBeenCalledTimes(1);

    const newLimit = schedulerMock.updateMaxConcurrentRequests.mock.calls[0][0];
    expect(typeof newLimit).toBe('number');
  });

  test('should respect lower bound (cores)', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockReturnValue(1);
    statisticsMock.getThroughputForInterval.mockReturnValue(20);

    controller.update();

    const appliedLimit = schedulerMock.updateMaxConcurrentRequests.mock.calls[0][0];
    expect(appliedLimit).toBeGreaterThanOrEqual(require('os').cpus().length);
  });

  test('should respect upper bound (inflightLimit * 10)', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockReturnValue(0.1);
    statisticsMock.getThroughputForInterval.mockReturnValue(50);

    controller.update();

    const appliedLimit = schedulerMock.updateMaxConcurrentRequests.mock.calls[0][0];
    expect(appliedLimit).toBeLessThanOrEqual(10 * 10); // inflightLimit * 10
  });

  test('should remove oldest element when intervalThroughput exceeds max size', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockReturnValue(150);
    statisticsMock.getThroughputForInterval.mockReturnValue(1);

    for (let i = 0; i < 50; i++) {
      controller['pushFixed'](controller['intervalThroughput'], i, 50);
    }

    controller.update();

    expect(controller['intervalThroughput'].length).toBe(50);
    expect(controller['intervalThroughput'][0]).toBe(1);
  });

  test('should decrease queue when above beta in calculateNewLimit', () => {
    statisticsMock.getPercentileLatencySuccessfulRequests.mockReturnValue(250);
    statisticsMock.getThroughputForInterval.mockReturnValue(20);

    const spy = jest.spyOn(controller as any, 'applyNewLimit');

    controller.update();

    const appliedLimit = schedulerMock.updateMaxConcurrentRequests.mock.calls[0][0];
    expect(appliedLimit).toBe(controller['inflightLimit']);
    expect(spy).toHaveBeenCalled();
  });
});

