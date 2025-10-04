import { AutoTuner } from "../../../src/application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";

describe('AutoTuner tests', () => {
  let concurrencyController: jest.Mocked<ConcurrencyController>;
  let latencyController: jest.Mocked<LatencyController>;
  let autoTuner: AutoTuner;

  beforeEach(() => {
    concurrencyController = {
      update: jest.fn(),
    } as unknown as jest.Mocked<ConcurrencyController>;

    latencyController = {
      update: jest.fn(),
      getTargetLatency: jest.fn(),
    } as unknown as jest.Mocked<LatencyController>;

    jest.useFakeTimers();

    autoTuner = new AutoTuner(concurrencyController, latencyController);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  test('should call update on both controllers according to intervals', () => {
    jest.advanceTimersByTime(2000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(1);
    expect(latencyController.update).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(8000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(5);
    expect(latencyController.update).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);
    expect(concurrencyController.update).toHaveBeenCalledTimes(6);
    expect(latencyController.update).toHaveBeenCalledTimes(1);
  });
});
