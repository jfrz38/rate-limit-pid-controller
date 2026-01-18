import { vi, describe, expect, beforeEach, Mocked } from 'vitest';

import { ControllerHistory } from "../../../src/application/auto-tuner/controller-history";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";
import { MathUtils } from "../../../src/domain/math/math-utils";
import { Statistics } from "../../../src/domain/statistics/statistics";

vi.mock("../../../src/core/logging/logger", () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn()
  }),
}));

describe('LatencyController', () => {
  let statistics: Mocked<Statistics>;
  let latencyController: LatencyController;
  let history: ControllerHistory;

  beforeEach(() => {
    statistics = {
      getLowestLatencyForInterval: vi.fn(),
    } as unknown as Mocked<Statistics>;

    history = {
      maxInflights: [],
      intervalThroughputs: [],
      length: 0,
      push: vi.fn()
    } as unknown as Mocked<ControllerHistory>;

    latencyController = new LatencyController(statistics, history);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should initialize with default targetLatency = 100', () => {
    expect(latencyController.targetLatency).toBe(100);
  });

  test('should set targetLatency to minLatency when maxInflights < 10', () => {
    statistics.getLowestLatencyForInterval.mockReturnValue(42);

    latencyController.update();

    expect(statistics.getLowestLatencyForInterval).toHaveBeenCalledTimes(1);
    expect(latencyController.targetLatency).toBe(42);
  });

  test('should apply EMA smoothing when covariance > 0', () => {
    statistics.getLowestLatencyForInterval.mockReturnValue(50);

    (history as any).length = 15;
    history.maxInflights = [10, 11, 12];
    history.intervalThroughputs = [100, 110, 120];

    vi.spyOn(MathUtils, 'covariance').mockReturnValue(5);

    latencyController.update();

    expect(latencyController.targetLatency).toBe(95);
    expect(MathUtils.covariance).toHaveBeenCalledWith(history.maxInflights, history.intervalThroughputs);
  });

  test('should maintain targetLatency if covariance is exactly 0', () => {
    statistics.getLowestLatencyForInterval.mockReturnValue(200);

    (history as any).length = 15;
    
    vi.spyOn(MathUtils, 'covariance').mockReturnValue(0);

    const previousTarget = latencyController.targetLatency;
    latencyController.update();

    expect(latencyController.targetLatency).toBe(previousTarget);
  });

  test('should reduce targetLatency when covariance < 0', () => {
    statistics.getLowestLatencyForInterval.mockReturnValue(80);

    (history as any).length = 5; 
    latencyController.update(); 
    expect(latencyController.targetLatency).toBe(80);

    (history as any).length = 15;
    vi.spyOn(MathUtils, 'covariance').mockReturnValue(-3);

    latencyController.update();

    expect(latencyController.targetLatency).toBe(64);
  });

  test('should not change targetLatency if covariance = 0', () => {
    const initialValue = 70;
    statistics.getLowestLatencyForInterval.mockReturnValue(initialValue);

    (latencyController as any).maxInflights = Array(10).fill(1);
    (latencyController as any).intervalThroughputs = Array(10).fill(2);

    vi.spyOn(MathUtils, 'covariance').mockReturnValue(0);

    latencyController.update();

    expect(latencyController.targetLatency).toBe(initialValue);
  });
});
