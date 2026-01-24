import { beforeEach, describe, expect, test, Mocked, vi, afterEach } from 'vitest';
import { DefaultOptions } from '../../../src/default-parameters';
import { Event } from '../../../src/domain/events';
import { NotEnoughStatsException } from '../../../src/domain/exceptions/not-enough-stats.exception';
import { IntervalQueue } from '../../../src/domain/interval/interval-queue';
import { MathUtils } from '../../../src/domain/math/math-utils';
import { Request } from '../../../src/domain/request';
import { Statistics } from '../../../src/domain/statistics/statistics';

describe('Statistics', () => {
    let statistics: Statistics;
    let intervalQueue: Mocked<IntervalQueue>;
    const MIN_REQUESTS = 5;

    beforeEach(() => {
        intervalQueue = {
            add: vi.fn(),
            getCompletedRequests: vi.fn(),
            getLatencies: vi.fn(),
            getLaunchedRequests: vi.fn(),
            getPriorities: vi.fn(),
        } as unknown as Mocked<IntervalQueue>;

        const options = {
            ...DefaultOptions.values.statistics,
            minRequestsForStats: MIN_REQUESTS,
            minRequestsForLatencyPercentile: MIN_REQUESTS,
            latencyPercentile: 95
        };

        statistics = new Statistics(intervalQueue, options);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('add', () => {
        test('should delegate adding request to intervalQueue', () => {
            const request = {} as Request;
            statistics.add(request);
            expect(intervalQueue.add).toHaveBeenCalledWith(request);
        });
    });

    describe('getAverageProcessingTime', () => {
        test('should throw NotEnoughStatsException if requests < minRequestsForStats', () => {
            intervalQueue.getCompletedRequests.mockReturnValue(Array(MIN_REQUESTS - 1));
            expect(() => statistics.getAverageProcessingTime()).toThrow(NotEnoughStatsException);
        });

        test('should calculate average based on COMPLETED and CREATED timestamps', () => {
            const req1 = createMockRequest(100, 200);
            const req2 = createMockRequest(100, 300);
            const requests = [req1, req2, ...Array(MIN_REQUESTS - 2).fill(req1)];
            
            intervalQueue.getCompletedRequests.mockReturnValue(requests);
            const spy = vi.spyOn(MathUtils, 'average').mockReturnValue(150);

            const result = statistics.getAverageProcessingTime();

            expect(result).toBe(150);
            expect(spy).toHaveBeenCalledWith(expect.arrayContaining([100, 200]));
        });
    });

    describe('getPercentileLatencySuccessfulRequests', () => {
        test('should throw if not enough latencies', () => {
            intervalQueue.getLatencies.mockReturnValue(Array(MIN_REQUESTS - 1));
            expect(() => statistics.getPercentileLatencySuccessfulRequests()).toThrow(NotEnoughStatsException);
        });

        test('should call MathUtils.percentile with configured latencyPercentile', () => {
            const latencies = [10, 20, 30, 40, 50];
            intervalQueue.getLatencies.mockReturnValue(latencies);
            const spy = vi.spyOn(MathUtils, 'percentile').mockReturnValue(45);

            const result = statistics.getPercentileLatencySuccessfulRequests();

            expect(result).toBe(45);
            expect(spy).toHaveBeenCalledWith(latencies, 95);
        });
    });

    describe('getSuccessfulThroughput', () => {
        test('should return the length of launched requests', () => {
            intervalQueue.getLaunchedRequests.mockReturnValue([{}, {}, {}] as any);
            expect(statistics.getSuccessfulThroughput()).toBe(3);
        });
    });

    describe('getLowestLatencyForInterval', () => {
        test('should return 0 if no latencies available', () => {
            intervalQueue.getLatencies.mockReturnValue([]);
            expect(statistics.getLowestLatencyForInterval()).toBe(0);
        });

        test('should return the minimum value from latencies', () => {
            intervalQueue.getLatencies.mockReturnValue([150, 80, 200, 100]);
            expect(statistics.getLowestLatencyForInterval()).toBe(80);
        });
    });

    describe('calculateCumulativePriorityDistribution', () => {
        test('should throw if not enough priorities', () => {
            intervalQueue.getPriorities.mockReturnValue(Array(MIN_REQUESTS - 1));
            expect(() => statistics.calculateCumulativePriorityDistribution(50)).toThrow(NotEnoughStatsException);
        });

        test('should call MathUtils.percentile with the provided threshold', () => {
            const priorities = [1, 2, 3, 4, 5, 6];
            intervalQueue.getPriorities.mockReturnValue(priorities);
            const spy = vi.spyOn(MathUtils, 'percentile').mockReturnValue(3);

            const result = statistics.calculateCumulativePriorityDistribution(25);

            expect(result).toBe(3);
            expect(spy).toHaveBeenCalledWith(priorities, 25);
        });
    });
});

function createMockRequest(createdTime: number, completedTime: number): Request {
    return {
        getEventTimestamp: vi.fn().mockImplementation((event: Event) => {
            if (event === Event.CREATED) {
                return createdTime;
            }
            if (event === Event.COMPLETED) {
                return completedTime;
            }
            return null;
        })
    } as unknown as Request;
}
