import { Statistics } from '../../src/application/statistics';
import { Event } from '../../src/domain/events';
import { NotEnoughStatsException } from '../../src/domain/exceptions/not-enough-stats.exception';
import { MathUtils } from '../../src/domain/math/math-utils';
import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';

describe('Statistics tests', () => {
    let statistics: Statistics;
    let intervalEnd: Date;
    const cohort = 128;

    beforeEach(() => {
        statistics = new Statistics();
        intervalEnd = new Date();
    });

    describe('Test getPercentileLatencySuccessfulRequests', () => {
        test('when no exists enough requests should throws expected exception', () => {
            for (let i = 0; i < 4; i++) {
                statistics.add(createCompletedRequest(5));
            }
            expect(() => statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toThrow(NotEnoughStatsException);
        });

        test('when request are not completed should throws expected exception', () => {
            for (let i = 0; i < 250; i++) {
                statistics.add(createNonCompletedRequest());
            }
            expect(() => statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toThrow(NotEnoughStatsException);
        });

        test('when requests are old should throws expected exception', () => {
            for (let i = 0; i < 250; i++) {
                statistics.add(createOldRequest());
            }
            expect(() => statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toThrow(NotEnoughStatsException);
        });

        test('when fixed latency should be the percentile p90', () => {
            // Latencies = [5, 5, .., 5]
            // p90 = 5
            const latency = 5;
            for (let i = 0; i < 250; i++) {
                statistics.add(createCompletedRequest(latency));
            }
            expect(statistics.getPercentileLatencySuccessfulRequests(intervalEnd)).toBe(latency);
        });

        test('when latencies ramp up should return the correct percentile p90', () => {
            // Latencies = [0, 1, 2, .., 249]
            // p90 = 224.1
            for (let i = 0; i < 250; i++) {
                statistics.add(createCompletedRequest(i));
            }
            const result = statistics.getPercentileLatencySuccessfulRequests(intervalEnd);
            expect(Math.round(result * 10) / 10).toBe(224.1);
        });
    })


    describe('Test getThroughputForInterval', () => {
        test('when no requests should return no throughputs', () => {
            expect(statistics.getThroughputForInterval(intervalEnd)).toBe(0);
        });

        test('when requests are completed outside the interval should return expected throughputs', () => {
            statistics.add(createOldRequest());
            statistics.add(createOldRequest());
            statistics.add(createOldRequest());
            expect(statistics.getThroughputForInterval(intervalEnd)).toBe(0);
        });

        test('when requests are completed within the interval should return expected throughputs', () => {
            statistics.add(createCompletedRequest(5));
            statistics.add(createCompletedRequest(5));
            statistics.add(createCompletedRequest(5));
            expect(statistics.getThroughputForInterval(intervalEnd)).toBe(3);
        });

        test('when requests are completed should return only completed within interval', () => {
            statistics.add(createCompletedRequest(5));
            statistics.add(createOldRequest());
            statistics.add(createCompletedRequest(5));
            expect(statistics.getThroughputForInterval(intervalEnd)).toBe(2);
        });
    })

    describe('Test getLowestLatencyForInterval', () => {
        test('when no requests should return 0 latency', () => {
            expect(statistics.getLowestLatencyForInterval(intervalEnd)).toBe(0);
        });

        test('when multiple requests with increasing latencies should return lowest latency', () => {
            for (let i = 1; i <= 4; i++) {
                statistics.add(createCompletedRequest(i));
            }
            expect(statistics.getLowestLatencyForInterval(intervalEnd)).toBe(1);
        });
    })

    describe('Test calculateCumulativePriorityDistribution', () => {
        const expectedResult = 0;
        const threshold = 10;
        const expectedPercentile = 100 - threshold;
        let spy: jest.SpyInstance<number, [values: number[], percentile: number], any>;

        beforeEach(() => {
            spy = jest.spyOn(MathUtils, 'percentile').mockReturnValue(expectedResult);
        });

        afterEach(() => {
            spy.mockRestore();
        });

        test('when exists only one value should calculate expected cumulative priority', () => {
            const values = [1];
            const expectedPriorities = createExpectedPriorities(values);
            values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
        });

        test('when exists unordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = [middle, max, min];
            const expectedPriorities = createExpectedPriorities(values);
            values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
        })

        test('when exists ordered values should calculate expected cumulative priority', () => {
            const max = 3;
            const middle = 2;
            const min = 1;

            const values = [max, middle, min];
            const expectedPriorities = createExpectedPriorities(values);
            values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold);

            expect(result).toBe(expectedResult);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
        })

        test('when exists same value should calculate expected cumulative priority', () => {
            const priority = 3;

            const values = [priority, priority, priority];
            const expectedPriorities = createExpectedPriorities(values);
            values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold)

            expect(result).toBe(expectedResult);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);

        });

        test('when exists multiple values should calculate expected cumulative priority', () => {
            const values = [3, 2, 5, 4, 4, 5, 4, 1, 4, 3];
            const expectedPriorities = createExpectedPriorities(values);
            values.forEach(value => statistics.add(createPriorityRequest(value)));

            const result = statistics.calculateCumulativePriorityDistribution(threshold)

            expect(result).toBe(expectedResult);
            expect(spy).toHaveBeenNthCalledWith(1, expectedPriorities, expectedPercentile);
        });

        function createExpectedPriorities(priorities: number[]): number[] {
            return priorities.map(priority => priority * cohort);
        }
    })

    function createPriorityRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority, 0));
    }

    function createCompletedRequest(latency: number): Request {
        const request = createNonCompletedRequest();
        request.status = Event.COMPLETED;
        const completed = new Date();
        const launched = new Date(completed.getTime() - latency);
        request.getEventLog().set(Event.LAUNCHED, launched);
        request.getEventLog().set(Event.COMPLETED, completed);
        return request;
    }

    function createOldRequest(): Request {
        const request = createNonCompletedRequest();
        request.status = Event.COMPLETED;
        const completed = new Date();
        const launched = new Date(completed.getTime() - 60_000); // 1 min ago
        request.getEventLog().set(Event.LAUNCHED, launched);
        request.getEventLog().set(Event.COMPLETED, completed);
        return request;
    }

    function createNonCompletedRequest(): Request {
        const request = createPriorityRequest(5);
        request.status = Event.LAUNCHED;
        return request;
    }
})
