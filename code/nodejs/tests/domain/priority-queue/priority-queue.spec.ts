import { Statistics } from "../../../src/application/statistics";
import { getLogger } from "../../../src/core/logging/logger";
import { Event } from "../../../src/domain/events";
import { Priority } from "../../../src/domain/priority";
import { RequestPriorityComparator } from "../../../src/domain/priority-queue/comparator";
import { Heap } from "../../../src/domain/priority-queue/heap";
import { PriorityQueue } from "../../../src/domain/priority-queue/priority-queue";
import { TimeoutHandler } from "../../../src/domain/priority-queue/timeout-handler";
import { Request } from "../../../src/domain/request";


jest.useFakeTimers();
jest.mock("../../../src/core/shutdown/interval-manager");

jest.mock("../../../src/core/logging/logger", () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn()
    }),
}));

describe('PriorityQueue', () => {
    let statistics: jest.Mocked<Statistics>;
    let heap: Heap;
    let queue: PriorityQueue;
    let timeoutHandler: jest.Mocked<TimeoutHandler>;
    let logger = jest.fn();

    beforeEach(() => {
        statistics = {
            getAverageProcessingTime: jest.fn(),
            getPercentileLatencySuccessfulRequests: jest.fn(),
            getThroughputForInterval: jest.fn(),
        } as unknown as jest.Mocked<Statistics>;

        timeoutHandler = {} as unknown as jest.Mocked<TimeoutHandler>;

        // Real implementation to test add, poll and remove requests
        heap = new Heap(RequestPriorityComparator.compare());

        (getLogger as jest.Mock).mockReturnValue({
            info: logger,
            warn: jest.fn(),
        });

        queue = new PriorityQueue(heap, timeoutHandler);
    });

    test('add and poll returns the same request', () => {
        const request = createRequest(0);

        queue.add(request);

        expect(queue.poll()).toBe(request);
    });

    test('poll when request timed out should return null', () => {
        const request = createRequest(0);
        const timeout = 300;

        (timeoutHandler as any).timeout = timeout;

        queue.add(request);

        jest.advanceTimersByTime(timeout + 100);

        expect(queue.poll()).toBeNull();
    });

    test('poll when adding two requests and times out one should return expected first request and null second request', () => {
        const firstRequest = createRequest(0);
        const secondRequest = createRequest(1);
        const timeout = 300;

        (timeoutHandler as any).timeout = timeout;

        queue.add(firstRequest);
        queue.add(secondRequest);

        expect(queue.poll()).toBe(firstRequest);

        jest.advanceTimersByTime(timeout + 100);

        expect(queue.poll()).toBeNull();
    });

    test('entryRequests and exitRequests counters should be correct', () => {
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

    test('getTimeSinceLastEmpty when never add a request should return 0', () => {
        expect(queue.getTimeSinceLastEmpty()).toBe(0);
    });

    test('getTimeSinceLastEmpty when one value is added should return expected time', () => {
        const request = createRequest(0);
        const timeout = 2000;

        (timeoutHandler as any).timeout = timeout;

        queue.add(request);

        jest.advanceTimersByTime(1200);

        expect(queue.getTimeSinceLastEmpty()).toBeGreaterThanOrEqual(1);
    });

    test('getTimeSinceLastEmpty when a request is added an polled should return 0', () => {
        const request = createRequest(0);
        queue.add(request);
        queue.poll();

        expect(queue.getTimeSinceLastEmpty()).toBe(0);
    });

    test('requests are evicted after timeout', () => {
        const request = createRequest(0);
        const timeout = 300;

        (timeoutHandler as any).timeout = timeout;
        queue.add(request);

        jest.advanceTimersByTime(timeout + 100);

        expect(request.status).toBe(Event.EVICTED);
    });

    test('when queue is empty should return expected values', () => {
        expect(queue.isEmpty()).toBe(true);
        expect(queue.length).toBe(0);
    });

    test('when queue is not empty should return expected values', () => {
        queue.add(createRequest(0));

        expect(queue.isEmpty()).toBe(false);
        expect(queue.length).toBe(1);
    });

    function createRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority));
    }
});
