import { Statistics } from "../../src/application/statistics";
import { Event } from "../../src/domain/events";
import { NotEnoughStatsException } from "../../src/domain/exceptions/not-enough-stats.exception";
import { Priority } from "../../src/domain/priority";
import { PriorityQueue } from "../../src/domain/priority-queue";
import { Request } from "../../src/domain/request";

jest.useFakeTimers();

describe('PriorityQueue', () => {
    let statistics: jest.Mocked<Statistics>;
    let queue: PriorityQueue;

    beforeEach(() => {
        statistics = {
            getAverageProcessingTime: jest.fn(),
            getPercentileLatencySuccessfulRequests: jest.fn(),
            getThroughputForInterval: jest.fn(),
        } as unknown as jest.Mocked<Statistics>;

        queue = new PriorityQueue(statistics);

        // Silence console.info
        jest.spyOn(console, 'info').mockImplementation(() => { });
    });

    test('add and poll returns the same request', () => {
        const request = createRequest(0);
        queue.add(request);
        expect(queue.poll()).toBe(request);
    });

    test('poll returns null if request timed out', () => {
        const request = createRequest(0);
        queue.add(request);
        jest.advanceTimersByTime(200);
        expect(queue.poll()).toBeNull();
    });

    test('poll after adding two requests removes first and times out second', () => {
        const firstRequest = createRequest(0);
        const secondRequest = createRequest(1);
        queue.add(firstRequest);
        queue.add(secondRequest);

        expect(queue.poll()).toBe(firstRequest);

        jest.advanceTimersByTime(200);
        expect(queue.poll()).toBeNull();
    });

    test('entryRequests and exitRequests counters', () => {
        const firstRequest = createRequest(0);
        const secondRequest = createRequest(0);

        expect(queue.entryRequests).toBe(0);
        expect(queue.exitRequests).toBe(0);

        queue.add(firstRequest);
        queue.add(secondRequest);
        expect(queue.entryRequests).toBe(2);
        expect(queue.exitRequests).toBe(0);

        queue.poll();
        expect(queue.entryRequests).toBe(2);
        expect(queue.exitRequests).toBe(1);

        jest.advanceTimersByTime(200);  // time to get evict on second request
        expect(queue.entryRequests).toBe(2);
        expect(queue.exitRequests).toBe(1);
    });

    test('getTimeSinceLastEmpty returns 0 if never added', () => {
        expect(queue.getTimeSinceLastEmpty()).toBeCloseTo(0, 1);
    });

    test('getTimeSinceLastEmpty after adding value', () => {
        const request = createRequest(0);
        queue.add(request);

        jest.advanceTimersByTime(1200);
        expect(queue.getTimeSinceLastEmpty()).toBeGreaterThanOrEqual(1);
    });

    test('getTimeSinceLastEmpty after adding and polling', () => {
        const request = createRequest(0);
        queue.add(request);
        queue.poll();

        expect(queue.getTimeSinceLastEmpty()).toBeCloseTo(0, 1);
    });

    test('requests are evicted after timeout', () => {
        const request = createRequest(0);
        queue.add(request);
        jest.advanceTimersByTime(200);
        expect(request.status).toBe(Event.EVICTED);
    });

    test('updateQueueTimeout logs info when NotEnoughStatsException is thrown', () => {
        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw new NotEnoughStatsException();
        });

        const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => { });

        (queue as any).updateQueueTimeout();
        expect(consoleSpy).toHaveBeenCalledWith('Not enough stats to update timeout');

        consoleSpy.mockRestore();
    });

    test('updateQueueTimeout re-throws unknown exceptions', () => {
        const error = new Error('Something went wrong');
        statistics.getAverageProcessingTime.mockImplementation(() => {
            throw error;
        });

        // Usamos expect().toThrow para comprobar que la excepción se propaga
        expect(() => {
            (queue as any).updateQueueTimeout();
        }).toThrow(error);
    });

    test('when queue is empty should return expected values', () => {
        (queue as any).queue = [];

        expect(queue.isEmpty()).toBe(true);
        expect(queue.length).toBe(0);
    });

    test('when queue is not empty should return expected values', () => {
        const newQueue = [createRequest(0)];
        (queue as any).queue = newQueue;

        expect(queue.isEmpty()).toBe(false);
        expect(queue.length).toBe(1);
    });


    function createRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority));
    }
});
