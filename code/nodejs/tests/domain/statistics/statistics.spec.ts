import { DefaultOptions } from '../../../src/default-parameters';
import { Event } from '../../../src/domain/events';
import { NotEnoughStatsException } from '../../../src/domain/exceptions/not-enough-stats.exception';
import { IntervalQueue } from '../../../src/domain/interval/interval-queue';
import { MathUtils } from '../../../src/domain/math/math-utils';
import { Request } from '../../../src/domain/request';
import { Statistics } from '../../../src/domain/statistics/statistics';

describe('Statistics tests', () => {
    let statistics: Statistics;
    let intervalQueue: jest.Mocked<IntervalQueue>;
    const maxRequests = 5;

    beforeEach(() => {
        intervalQueue = {
            getCompletedRequests: jest.fn(),
            getLatencies: jest.fn(),
            getLaunchedRequests: jest.fn(),
            getPriorities: jest.fn(),
            add: jest.fn(),
        } as unknown as jest.Mocked<IntervalQueue>;

        const defaultStatsOptions = DefaultOptions.values.statistics;
        defaultStatsOptions.minRequestsForStats = maxRequests;
        defaultStatsOptions.minRequestsForLatencyPercentile = maxRequests;

        statistics = new Statistics(intervalQueue, DefaultOptions.values.statistics);
    });

    afterEach(() => {
        jest.restoreAllMocks(); 
    });

    describe('Test add', () => {
        test('when add request should call expected method', () => {
            const request = {} as unknown as jest.Mocked<Request>;

            statistics.add(request);

            expect(intervalQueue.add).toHaveBeenNthCalledWith(1, request);
        });

    });

    describe('Test getPercentileLatencySuccessfulRequests', () => {
        test('when no exists enough requests should throws expected exception', () => {
            const latencies = Array(maxRequests - 1).fill(1);

            intervalQueue.getLatencies.mockReturnValueOnce(latencies);
            const spy = jest.spyOn(MathUtils, 'percentile').mockReturnValue(1);

            expect(() => statistics.getPercentileLatencySuccessfulRequests()).toThrow(NotEnoughStatsException);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
            expect(spy).not.toHaveBeenCalled();
        });

        test('calculateCumulativePriorityDistribution should use inverse percentile', () => {
            const priorities = [1, 2, 3, 4, 5];
            intervalQueue.getPriorities.mockReturnValueOnce(priorities);
            const spy = jest.spyOn(MathUtils, 'percentile');

            statistics.calculateCumulativePriorityDistribution(20);

            expect(spy).toHaveBeenCalledWith(priorities, 80);
            spy.mockRestore();
        });

        test('when latency should return expected value', () => {
            const latency = 5;
            const latencies = Array(maxRequests).fill(latency);

            intervalQueue.getLatencies.mockReturnValueOnce(latencies);
            const spy = jest.spyOn(MathUtils, 'percentile').mockReturnValue(latency);

            expect(statistics.getPercentileLatencySuccessfulRequests()).toBe(latency);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenNthCalledWith(1, latencies, DefaultOptions.values.statistics.latencyPercentile)

            spy.mockRestore();
        });

    })

    describe('Test getThroughputForInterval', () => {
        test('when no requests should return no throughputs', () => {
            intervalQueue.getLaunchedRequests.mockReturnValueOnce([]);

            expect(statistics.getSuccessfulThroughput()).toBe(0);
            expect(intervalQueue.getLaunchedRequests).toHaveBeenCalledTimes(1);
        });

        test('when any request should return expected throughputs', () => {
            const requests = 10;

            intervalQueue.getLaunchedRequests.mockReturnValueOnce(Array(requests).fill(1));

            expect(statistics.getSuccessfulThroughput()).toBe(requests);
            expect(intervalQueue.getLaunchedRequests).toHaveBeenCalledTimes(1);
        });
    })

    describe('Test getLowestLatencyForInterval', () => {
        test('when no requests should return 0 latency', () => {
            intervalQueue.getLatencies.mockReturnValueOnce([]);

            expect(statistics.getLowestLatencyForInterval()).toBe(0);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
        });

        test('when multiple requests should return lowest latency', () => {
            const latencies = [4, 3, 2, 1];
            intervalQueue.getLatencies.mockReturnValueOnce(latencies);

            expect(statistics.getLowestLatencyForInterval()).toBe(1);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
        });

        test('when multiple disordered requests should return lowest latency', () => {
            const latencies = [2, 4, 1, 3];
            intervalQueue.getLatencies.mockReturnValueOnce(latencies);

            expect(statistics.getLowestLatencyForInterval()).toBe(1);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
        });

        test('getLowestLatencyForInterval should handle identical latencies', () => {
            intervalQueue.getLatencies.mockReturnValueOnce([10, 10, 10]);
            expect(statistics.getLowestLatencyForInterval()).toBe(10);
        });
    })

    describe('Test calculateCumulativePriorityDistribution', () => {
        const expectedResult = 0;
        const threshold = 10;
        const expectedPercentile = 100 - threshold;
        const expectedPriorities = [1];
        let spy: jest.SpyInstance<number, [values: number[], percentile: number], any>;

        beforeEach(() => {
            intervalQueue.getPriorities.mockReturnValueOnce(expectedPriorities);
            spy = jest.spyOn(MathUtils, 'percentile').mockReturnValue(expectedResult);
        });

        afterEach(() => {
            expect(intervalQueue.getPriorities).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
            spy.mockRestore();
        });

        test('when exists only one value should calculate expected cumulative priority', () => {
            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);
        });

        test('when exists values should return expected cumulative priority', () => {
            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);
        })


    })

    describe('Test getAverageProcessingTime', () => {

        test('when there are not enough valid requests should throw NotEnoughStatsException', () => {
            intervalQueue.getCompletedRequests.mockReturnValueOnce(Array(maxRequests - 1).fill(createRequestWithEvents(0, 10)));

            expect(() => statistics.getAverageProcessingTime()).toThrow(NotEnoughStatsException);

            expect(intervalQueue.getCompletedRequests).toHaveBeenCalledTimes(1);
        });

        test('when there are enough valid requests should return expected result', () => {
            const expectedAverage = 10;
            const validRequest = Array(maxRequests).fill(createRequestWithEvents(0, 10));

            const spy = jest.spyOn(MathUtils, 'average').mockReturnValue(expectedAverage);

            intervalQueue.getCompletedRequests.mockReturnValueOnce(validRequest);

            expect(statistics.getAverageProcessingTime()).toBe(expectedAverage);

            expect(intervalQueue.getCompletedRequests).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenNthCalledWith(1, expect.any(Array));
        });

        test('getAverageProcessingTime should calculate real durations correctly', () => {
            const req1 = createRequestWithEvents(100, 200);
            const req2 = createRequestWithEvents(100, 300);

            const validRequests = [req1, req2, ...Array(maxRequests - 2).fill(req1)];

            intervalQueue.getCompletedRequests.mockReturnValueOnce(validRequests);

            const result = statistics.getAverageProcessingTime();

            expect(result).toBe(120);
        });

        function createRequestWithEvents(createdDate: number, completedDate: number): Request {
            const request = {} as unknown as jest.Mocked<Request>;
            const created = new Date(createdDate);
            const completed = new Date(completedDate);
            request.hasEventCreatedAndCompleted = jest.fn().mockReturnValue(true);
            request.getEventByType = jest.fn()
                .mockImplementation((type: Event) => type === Event.CREATED ? created : completed);
            return request;
        }
    });
})
