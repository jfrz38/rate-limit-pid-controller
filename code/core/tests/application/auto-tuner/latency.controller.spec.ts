import { beforeEach, describe, expect, test, vi, type Mocked } from 'vitest';

import { ControllerHistory } from '../../../src/application/auto-tuner/controller-history';
import { LatencyController } from '../../../src/application/auto-tuner/latency.controller';
import { MathUtils } from '../../../src/domain/math/math-utils';
import { Statistics, type StatisticsSnapshot } from '../../../src/domain/statistics/statistics';

vi.mock('../../../src/core/logging/logger', () => ({
  getLogger: vi.fn().mockReturnValue({ info: vi.fn() }),
}));

const snapshot = (id: number, minimumLatency: number): StatisticsSnapshot => ({
  id,
  percentileLatency: minimumLatency,
  minimumLatency,
  averageLatency: minimumLatency,
  successfulRequests: 100,
  throughputPerSecond: 50,
});

describe('LatencyController', () => {
  let statistics: Mocked<Statistics>;
  let history: ControllerHistory;
  let controller: LatencyController;

  beforeEach(() => {
    statistics = {
      getLatestSnapshot: vi.fn(),
    } as unknown as Mocked<Statistics>;
    history = new ControllerHistory();
    controller = new LatencyController(statistics, history);
  });

  test('starts with a 100 ms target and ignores missing snapshots', () => {
    controller.update();

    expect(controller.targetLatency).toBe(100);
  });

  test('uses the bucket minimum latency during warmup', () => {
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 42));

    controller.update();

    expect(controller.targetLatency).toBe(42);
  });

  test('does not process the same bucket twice', () => {
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 42));
    controller.update();
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 80));

    controller.update();

    expect(controller.targetLatency).toBe(42);
  });

  test('moves the target toward minimum latency when covariance is positive', () => {
    for (let value = 1; value <= 10; value++) {
      history.push(value, value * 10);
    }
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 50));

    controller.update();

    expect(controller.targetLatency).toBe(95);
  });

  test('reduces the target when covariance is negative', () => {
    for (let value = 1; value <= 10; value++) {
      history.push(value, 110 - value * 10);
    }
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 80));

    controller.update();

    expect(controller.targetLatency).toBe(80);
  });

  test('keeps the target when covariance is zero', () => {
    for (let value = 1; value <= 10; value++) {
      history.push(value, 10);
    }
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 200));

    controller.update();

    expect(MathUtils.covariance(history.maxInflights, history.intervalThroughputs)).toBe(0);
    expect(controller.targetLatency).toBe(100);
  });

  test('filters percentile samples with a five-sample median and EMA', () => {
    expect(controller.aggregate(100)).toBe(100);
    expect(controller.aggregate(1_000)).toBe(100);
    expect(controller.aggregate(110)).toBe(102);
    expect(controller.aggregate(120)).toBeCloseTo(103.6);
    expect(controller.aggregate(130)).toBeCloseTo(106.88);
    expect(controller.aggregate(140)).toBeCloseTo(111.504);
  });

  test('reset clears target and latency filter state', () => {
    controller.aggregate(300);
    statistics.getLatestSnapshot.mockReturnValue(snapshot(1, 50));
    controller.update();

    controller.reset();

    expect(controller.targetLatency).toBe(100);
    expect(controller.aggregate(20)).toBe(20);
  });
});
