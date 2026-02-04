import { vi, describe, expect, beforeEach, Mock, Mocked } from 'vitest';

import { getLogger } from "../../../src/core/logging/logger";
import { DefaultOptions } from "../../../src/default-parameters";
import { NotEnoughStatsException } from "../../../src/domain/exceptions/not-enough-stats.exception";
import { TimeoutHandler } from "../../../src/domain/priority-queue/timeout-handler";
import { Statistics } from "../../../src/domain/statistics/statistics";
import { Timeout } from "../../../src/domain/types/timeout";
import { Request } from "../../../src/domain/request";
import { Priority } from "../../../src/domain/priority";

vi.mock("../../../src/core/shutdown/interval-manager");
vi.mock("../../../src/core/logging/logger", () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn()
    }),
}));

describe('Queue timeout handler', () => {
    let statistics: Mocked<Statistics>;
    let timeoutHandler: TimeoutHandler;
    let logger = vi.fn();

    const timeoutParameters = DefaultOptions.values.timeout as unknown as Mocked<Timeout>;

    beforeEach(() => {
        vi.useFakeTimers();

        statistics = {
            getAverageProcessingTime: vi.fn(),
        } as unknown as Mocked<Statistics>;

        (getLogger as Mock).mockReturnValue({
            info: logger,
            warn: vi.fn(),
        });

        timeoutHandler = new TimeoutHandler(statistics, timeoutParameters);
    });

    test('updateQueueTimeout when NotEnoughStatsException is thrown should not throw exception', () => {
        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw new NotEnoughStatsException();
        });

        expect(() => {
            (timeoutHandler as any).updateQueueTimeout();
        }).not.toThrow();
        expect(logger).toHaveBeenCalledWith('Not enough stats to update timeout');
    });

    test('updateQueueTimeout when unknown exception should re-throws', () => {
        const error = new Error('Something went wrong');

        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw error;
        });

        expect(() => {
            (timeoutHandler as any).updateQueueTimeout();
        }).toThrow(error);
    });

    test('updateQueueTimeout when timeout is the same should not update timeout', () => {
        const timeout: number = 200;

        (timeoutHandler as any)._timeout = timeout;
        (timeoutHandler as any).ratio = 1;
        statistics.getAverageProcessingTime.mockReturnValue(200);

        (timeoutHandler as any).updateQueueTimeout();

        const newTimeout: number = timeoutHandler.timeout;

        expect(newTimeout).toBeDefined();
        expect(newTimeout).toBe(timeout);
    });

    test('updateQueueTimeout when timeout is modified should update timeout', () => {
        const timeout: number = 200;
        const ratio = 2;
        const expectedTimeout = timeout * ratio;

        (timeoutHandler as any)._timeout = timeout;
        (timeoutHandler as any).ratio = ratio;
        statistics.getAverageProcessingTime.mockReturnValue(200);

        (timeoutHandler as any).updateQueueTimeout();

        const newTimeout: number = timeoutHandler.timeout;

        expect(newTimeout).toBeDefined();
        expect(newTimeout).toBe(expectedTimeout);
    });

    test('updateQueueTimeout should round the resulting timeout to the nearest integer', () => {
        (timeoutHandler as any).ratio = 1.5;
        statistics.getAverageProcessingTime.mockReturnValue(100.4);

        (timeoutHandler as any).updateQueueTimeout();

        expect(timeoutHandler.timeout).toBe(151);
    });

    test('should update timeout automatically when time passes (integration with setInterval)', () => {
        vi.useFakeTimers();
        const handler = new TimeoutHandler(statistics, timeoutParameters);

        statistics.getAverageProcessingTime.mockReturnValue(500);
        (handler as any).ratio = 1;

        vi.advanceTimersByTime(1000);

        expect(handler.timeout).toBe(500);
        vi.useRealTimers();
    });

    function createRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority));
    }
});
