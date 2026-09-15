import { afterEach, beforeEach, describe, expect, test, Mocked, vi } from 'vitest';

import { Event } from '../../../src/domain/events';
import { NotEnoughStatsException } from '../../../src/domain/exceptions/not-enough-stats.exception';
import { ExecutionBucket, IntervalQueue } from '../../../src/domain/interval/interval-queue';
import { RequestInterval } from '../../../src/domain/interval/request-interval';
import { Request } from '../../../src/domain/request';
import { Statistics } from '../../../src/domain/statistics/statistics';

describe('Statistics', () => {
    let queue: Mocked<IntervalQueue>;
    let statistics: Statistics;

    beforeEach(() => {
        queue = {
            add: vi.fn(),
            recordSuccessful: vi.fn(),
            closeExecutionBucket: vi.fn(),
            getAverageLatency: vi.fn(),
            getPriorities: vi.fn(),
        } as unknown as Mocked<IntervalQueue>;
        statistics = new Statistics(queue, {
            minRequestsForStats: 5,
            minRequestsForLatencyPercentile: 250,
            latencyPercentile: 90,
        });
    });

    afterEach(() => vi.restoreAllMocks());

    test('separates incoming and successful records', () => {
        const request = {} as Request;
        statistics.add(request);
        statistics.recordSuccessful(request);
        expect(queue.add).toHaveBeenCalledWith(request);
        expect(queue.recordSuccessful).toHaveBeenCalledWith(request);
    });

    test('creates one coherent snapshot from a closed bucket', () => {
        queue.closeExecutionBucket.mockReturnValue(bucket({
            latencies: [10, 20, 30, 40, 50],
            successfulRequests: 250,
            averageLatency: 30,
            minimumLatency: 10,
            durationSeconds: 2,
        }));

        expect(statistics.takeSnapshot()).toEqual({
            id: 1,
            percentileLatency: 46,
            minimumLatency: 10,
            averageLatency: 30,
            successfulRequests: 250,
            throughputPerSecond: 125,
        });
        expect(statistics.getSuccessfulThroughput()).toBe(250);
        expect(statistics.getSuccessfulThroughputPerSecond()).toBe(125);
    });

    test('publishes an expired bucket with enough general statistics', () => {
        queue.closeExecutionBucket.mockReturnValue(bucket({ successfulRequests: 10 }));
        expect(statistics.takeSnapshot()).toMatchObject({
            successfulRequests: 10,
            throughputPerSecond: 5,
        });
    });

    test('does not publish an expired bucket without enough general statistics', () => {
        queue.closeExecutionBucket.mockReturnValue(bucket({ successfulRequests: 4 }));
        expect(statistics.takeSnapshot()).toBeNull();
    });

    test('reports an expired empty bucket as discarded', () => {
        queue.closeExecutionBucket.mockReturnValue(null);
        expect(statistics.takeSnapshot()).toBeNull();
    });

    test('publishes a low-throughput bucket when its maximum duration expires', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const intervalQueue = new IntervalQueue(new RequestInterval(2, 30), 1000);
        const lowThroughputStatistics = new Statistics(intervalQueue, {
            minRequestsForStats: 5,
            minRequestsForLatencyPercentile: 250,
            latencyPercentile: 90,
        });
        for (let index = 0; index < 5; index++) {
            intervalQueue.recordSuccessful(completedRequest(index * 100, index * 100 + 10));
        }
        now.mockReturnValue(30_000);

        expect(lowThroughputStatistics.takeSnapshot()).toMatchObject({
            percentileLatency: 10,
            successfulRequests: 5,
            throughputPerSecond: 5 / 30,
        });
    });

    test('uses service-time average from the active bucket', () => {
        queue.getAverageLatency.mockReturnValue(75);
        expect(statistics.getAverageProcessingTime()).toBe(75);
        queue.getAverageLatency.mockReturnValue(undefined);
        expect(() => statistics.getAverageProcessingTime()).toThrow(NotEnoughStatsException);
    });

    test('calculates priority percentiles from incoming samples', () => {
        queue.getPriorities.mockReturnValue([0, 100, 200, 300, 400]);
        expect(statistics.calculateCumulativePriorityDistribution(50)).toBe(200);
    });
});

function bucket(overrides: Partial<ExecutionBucket>): ExecutionBucket {
    return {
        id: 1,
        latencies: [10],
        successfulRequests: 250,
        averageLatency: 10,
        minimumLatency: 10,
        durationSeconds: 2,
        ...overrides,
    };
}

function completedRequest(launched: number, completed: number): Request {
    return {
        getEventTimestamp: (event: Event) => event === Event.LAUNCHED ? launched : completed,
    } as Request;
}
