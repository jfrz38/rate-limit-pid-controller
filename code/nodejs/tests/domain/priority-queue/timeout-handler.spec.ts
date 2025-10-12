import { Statistics } from "../../../src/application/statistics";
import { getLogger } from "../../../src/core/logging/logger";
import { NotEnoughStatsException } from "../../../src/domain/exceptions/not-enough-stats.exception";
import { TimeoutHandler } from "../../../src/domain/priority-queue/timeout-handler";

jest.mock("../../../src/core/logging/logger", () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn()
    }),
}));

describe('Queue timeout handler', () => {
    let statistics: jest.Mocked<Statistics>;
    let timeoutHandler: jest.Mocked<TimeoutHandler>;
    let logger = jest.fn();

    beforeEach(() => {
        statistics = {
            getAverageProcessingTime: jest.fn(),
            getPercentileLatencySuccessfulRequests: jest.fn(),
            getThroughputForInterval: jest.fn(),
        } as unknown as jest.Mocked<Statistics>;

        (getLogger as jest.Mock).mockReturnValue({
            info: logger,
            warn: jest.fn(),
        });

        timeoutHandler = new TimeoutHandler(statistics);
    });

    test('updateQueueTimeout when NotEnoughStatsException is thrown should not throw exception', () => {
        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw new NotEnoughStatsException();
        });

        expect(() => {
            (timeoutHandler as any).updateQueueTimeout()
        }).not.toThrow();
        expect(logger).toHaveBeenCalledWith('Not enough stats to update timeout');
    });

    test('updateQueueTimeout re-throws unknown exceptions', () => {
        const error = new Error('Something went wrong');
        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw error;
        });

        expect(() => {
            (timeoutHandler as any).updateQueueTimeout();
        }).toThrow(error);
    });
});
