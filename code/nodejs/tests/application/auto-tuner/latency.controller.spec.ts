import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";
import { Statistics } from "../../../src/application/statistics";
import { MathUtils } from "../../../src/domain/math/math-utils";

describe('LatencyController', () => {
  let statisticsMock: jest.Mocked<Statistics>;
  let latencyController: LatencyController;

  beforeEach(() => {
    statisticsMock = {
      getLowestLatencyForInterval: jest.fn(),
    } as unknown as jest.Mocked<Statistics>;

    latencyController = new LatencyController(statisticsMock);

    // Silence console.info
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize with default targetLatency = 100', () => {
    expect(latencyController.targetLatency).toBe(100);
  });

  test('should set targetLatency to minLatency when maxInflights < 10', () => {
    statisticsMock.getLowestLatencyForInterval.mockReturnValue(42);

    latencyController.update();

    expect(statisticsMock.getLowestLatencyForInterval).toHaveBeenCalled();
    expect(latencyController.targetLatency).toBe(42);
  });

  test('should keep targetLatency = minLatency when covariance > 0', () => {
    statisticsMock.getLowestLatencyForInterval.mockReturnValue(50);

    (latencyController as any).maxInflights = Array(10).fill(1);
    (latencyController as any).intervalThroughputs = Array(10).fill(2);

    jest.spyOn(MathUtils, 'covariance').mockReturnValue(5); // covariance > 0

    latencyController.update();

    expect(MathUtils.covariance).toHaveBeenCalledWith(
      (latencyController as any).maxInflights,
      (latencyController as any).intervalThroughputs
    );
    expect(latencyController.targetLatency).toBe(50);
  });

  test('should reduce targetLatency when covariance < 0', () => {
    statisticsMock.getLowestLatencyForInterval.mockReturnValue(80);

    (latencyController as any).maxInflights = Array(10).fill(1);
    (latencyController as any).intervalThroughputs = Array(10).fill(2);

    jest.spyOn(MathUtils, 'covariance').mockReturnValue(-3); // covariance < 0

    latencyController.update();

    expect(latencyController.targetLatency).toBe(64);
  });

  test('should not change targetLatency if covariance = 0', () => {
    statisticsMock.getLowestLatencyForInterval.mockReturnValue(70);

    (latencyController as any).maxInflights = Array(10).fill(1);
    (latencyController as any).intervalThroughputs = Array(10).fill(2);

    jest.spyOn(MathUtils, 'covariance').mockReturnValue(0);

    latencyController.update();

    expect(latencyController.targetLatency).toBe(70);
  });
});
