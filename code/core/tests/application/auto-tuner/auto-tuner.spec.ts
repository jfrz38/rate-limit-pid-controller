import { vi, describe, expect, beforeEach, Mock, Mocked } from 'vitest';

import { AutoTuner } from "../../../src/application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";

vi.mock("../../../src/core/shutdown/interval-manager");

describe('AutoTuner tests', () => {
  let concurrencyController: Mocked<ConcurrencyController>;
  let latencyController: Mocked<LatencyController>;
  let autoTuner: AutoTuner;

  beforeEach(() => {
    concurrencyController = {
      update: vi.fn(),
    } as unknown as Mocked<ConcurrencyController>;

    latencyController = {
      update: vi.fn(),
      getTargetLatency: vi.fn(),
    } as unknown as Mocked<LatencyController>;

    vi.useFakeTimers();

    autoTuner = new AutoTuner(concurrencyController, latencyController);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  test('should call update on both controllers according to intervals', () => {
    vi.advanceTimersByTime(2000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(1);
    expect(latencyController.update).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(8000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(5);
    expect(latencyController.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(6);
    expect(latencyController.update).toHaveBeenCalledTimes(1);
  });
});
