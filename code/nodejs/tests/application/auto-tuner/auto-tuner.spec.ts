import { AutoTuner } from "../../../src/application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "../../../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../../../src/application/auto-tuner/latency.controller";

describe('AutoTuner tests', () => {
  let concurrencyControllerMock: jest.Mocked<ConcurrencyController>;
  let latencyControllerMock: jest.Mocked<LatencyController>;
  let autoTuner: AutoTuner;

  beforeEach(() => {
    concurrencyControllerMock = {
      update: jest.fn(),
    } as unknown as jest.Mocked<ConcurrencyController>;

    latencyControllerMock = {
      update: jest.fn(),
      getTargetLatency: jest.fn(),
    } as unknown as jest.Mocked<LatencyController>;

    jest.useFakeTimers();

    autoTuner = new AutoTuner(concurrencyControllerMock, latencyControllerMock);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  test('should call update on both controllers according to intervals', () => {
    jest.advanceTimersByTime(2000);
    expect(concurrencyControllerMock.update).toHaveBeenCalledTimes(1);
    expect(latencyControllerMock.update).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(8000);
    expect(concurrencyControllerMock.update).toHaveBeenCalledTimes(5);
    expect(latencyControllerMock.update).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);
    expect(concurrencyControllerMock.update).toHaveBeenCalledTimes(6);
    expect(latencyControllerMock.update).toHaveBeenCalledTimes(1);
  });
});
