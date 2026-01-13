import { DefaultOptions } from '../../../src/default-parameters';
import { Event } from '../../../src/domain/events';
import { NotEnoughStatsException } from '../../../src/domain/exceptions/not-enough-stats.exception';
import { IntervalQueue } from '../../../src/domain/interval/interval-queue';
import { MathUtils } from '../../../src/domain/math/math-utils';
import { Request } from '../../../src/domain/request';
import { Statistics } from '../../../src/domain/statistics/statistics';

describe('Statistics tests', () => {
    let statistics: Statistics;
    // let intervalEnd: Date;
    // let requestInterval: jest.Mocked<RequestInterval>;
    let intervalQueue: jest.Mocked<IntervalQueue>;
    // const cohort = 128;
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
        // intervalEnd = new Date();
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

        // TODO: Si son completas o no va en el test de intervalQueue
        // test('when request are not completed should throws expected exception', () => {
        //     for (let i = 0; i < 250; i++) {
        //         statistics.add(createNonCompletedRequest());
        //     }
        //     expect(() => statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toThrow(NotEnoughStatsException);
        // });

        // TODO: Si son viejas o no va en el test de intervalQueue
        // test('when requests are old should throws expected exception', () => {
        //     for (let i = 0; i < 250; i++) {
        //         statistics.add(createOldRequest());
        //     }
        //     expect(() => statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toThrow(NotEnoughStatsException);
        // });

        test('when latency should return expected value', () => {
            // Latencies = [5, 5, .., 5]
            // p90 = 5
            // TODO: Esta comprobación va para el test de percentile
            // const latencies = Array(250).fill(createCompletedRequest(latency));
            const latency = 5;
            const latencies = Array(maxRequests).fill(latency);

            intervalQueue.getLatencies.mockReturnValueOnce(latencies);
            const spy = jest.spyOn(MathUtils, 'percentile').mockReturnValue(latency);

            expect(statistics.getPercentileLatencySuccessfulRequests()).toBe(latency);

            expect(intervalQueue.getLatencies).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenNthCalledWith(1, latencies, DefaultOptions.values.statistics.latencyPercentile)

            spy.mockRestore();
        });

        // TODO: Esta comprobación va para el test de percentile
        // test('when latencies ramp up should return the correct percentile p90', () => {
        //     // Latencies = [0, 1, 2, .., 249]
        //     // p90 = 224.1
        //     for (let i = 0; i < 250; i++) {
        //         statistics.add(createCompletedRequest(i));
        //     }
        //     const result = statistics.getPercentileLatencySuccessfulRequests();

        //     expect(Math.round(result * 10) / 10).toBe(224.1);
        // });
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

        // TODO: Este test va para el intervalQueue
        // test('when requests are completed outside the interval should return expected throughputs', () => {
        //     statistics.add(createOldRequest());
        //     statistics.add(createOldRequest());
        //     statistics.add(createOldRequest());
        //     expect(statistics.getSuccessfulThroughput(intervalEnd)).toBe(0);
        // });

        // TODO: Este test va para el intervalQueue
        // test('when requests are completed within the interval should return expected throughputs', () => {
        //     statistics.add(createCompletedRequest(5));
        //     statistics.add(createCompletedRequest(5));
        //     statistics.add(createCompletedRequest(5));
        //     expect(statistics.getSuccessfulThroughput(intervalEnd)).toBe(3);
        // });

        // TODO: Este test va para el intervalQueue
        // test('when requests are completed should return only completed within interval', () => {
        //     statistics.add(createCompletedRequest(5));
        //     statistics.add(createOldRequest());
        //     statistics.add(createCompletedRequest(5));
        //     expect(statistics.getSuccessfulThroughput(intervalEnd)).toBe(2);
        // });
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
            // intervalQueue.getPriorities.mockReturnValueOnce(expectedPriorities);

            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);

            // expect(intervalQueue.getPriorities).toHaveBeenCalledTimes(1);
            // expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
        });

        test('when exists values should return expected cumulative priority', () => {
            // const max = 3;
            // const middle = 2;
            // const min = 1;

            // const values = [middle, max, min];
            // const expectedPriorities = createExpectedPriorities(values);
            // values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);

            // expect(intervalQueue.getPriorities).toHaveBeenCalledTimes(1);
            // expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
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
