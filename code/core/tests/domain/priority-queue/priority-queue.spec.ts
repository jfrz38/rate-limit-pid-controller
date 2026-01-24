import { vi, describe, expect, beforeEach, Mock, Mocked } from 'vitest';

import { getLogger } from "../../../src/core/logging/logger";
import { Event } from "../../../src/domain/events";
import { Priority } from "../../../src/domain/priority";
import { RequestPriorityComparator } from "../../../src/domain/priority-queue/comparator";
import { Heap } from "../../../src/domain/priority-queue/heap";
import { PriorityQueue } from "../../../src/domain/priority-queue/priority-queue";
import { TimeoutHandler } from "../../../src/domain/priority-queue/timeout-handler";
import { Request } from "../../../src/domain/request";

vi.useFakeTimers();

vi.mock("../../../src/core/logging/logger", () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn()
    }),
}));

describe('PriorityQueue', () => {
    let heap: Heap;
    let queue: PriorityQueue;
    let timeoutHandler: Mocked<TimeoutHandler>;
    let logger = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.clearAllTimers();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

        vi.restoreAllMocks();

        timeoutHandler = {
            timeout: 300
        } as any as Mocked<TimeoutHandler>;

        (getLogger as Mock).mockReturnValue({
            info: logger,
            warn: vi.fn(),
        });


        // Real implementation to test add, poll and remove requests
        heap = new Heap(RequestPriorityComparator.compare());
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

        vi.advanceTimersByTime(timeout + 100);

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

        vi.advanceTimersByTime(timeout + 100);

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

        vi.advanceTimersByTime(200);  // time to get evict on second request
        expect(queue.entryRequests).toBe(2);
        expect(queue.exitRequests).toBe(1);
    });

    test('getSecondsSinceLastEmpty when never add a request should return 0', () => {
        expect(queue.getSecondsSinceLastEmpty()).toBe(0);
    });

    test('getSecondsSinceLastEmpty when one value is added should return expected time', () => {
        const request = createRequest(0);
        const timeout = 2000;

        (timeoutHandler as any).timeout = timeout;

        queue.add(request);

        vi.advanceTimersByTime(1200);

        expect(queue.getSecondsSinceLastEmpty()).toBeGreaterThanOrEqual(1);
    });

    test('getSecondsSinceLastEmpty when a request is added an polled should return 0', () => {
        const request = createRequest(0);
        queue.add(request);
        queue.poll();

        expect(queue.getSecondsSinceLastEmpty()).toBe(0);
    });

    test('requests are evicted after timeout', () => {
        const request = createRequest(0);
        const timeout = 300;

        (timeoutHandler as any).timeout = timeout;
        queue.add(request);

        vi.advanceTimersByTime(timeout + 100);

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

    test('should emit requestAdded event when a request is added', () => {
        const spy = vi.fn();
        queue.on('requestAdded', spy);

        queue.add(createRequest(0));

        expect(spy).toHaveBeenCalledTimes(1);
    });

    test('should not return a request that was already evicted by setTimeout', () => {
        const request = createRequest(0);
        queue.add(request);

        vi.advanceTimersByTime(timeoutHandler.timeout + 1);

        const result = queue.poll();

        expect(result).toBeNull();
        expect(queue.length).toBe(0);
        expect(request.status).toBe(Event.EVICTED);
    });

    test('resetCounters should set entry and exit requests to zero', () => {
        queue.add(createRequest(0));
        queue.poll();

        expect(queue.entryRequests).toBe(1);
        expect(queue.exitRequests).toBe(1);

        queue.resetCounters();

        expect(queue.entryRequests).toBe(0);
        expect(queue.exitRequests).toBe(0);
    });

    test('should clear timeout when request is polled', () => {
        vi.clearAllTimers();

        const request = createRequest(0);
        queue.add(request);

        expect(vi.getTimerCount()).toBe(1);

        queue.poll();

        expect(vi.getTimerCount()).toBe(0);
    });

    function createRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority));
    }

    test('branch true: should remove request and log eviction if still in queue when timeout fires', () => {
        const request = createRequest(10);

        vi.spyOn(heap, 'indexOf').mockReturnValue(0);
        const removeSpy = vi.spyOn(heap, 'remove');

        queue.add(request);

        vi.advanceTimersByTime(timeoutHandler.timeout);

        expect(removeSpy).toHaveBeenCalledWith(request);
        expect(request.status).toBe(Event.EVICTED);
        expect(logger).toHaveBeenCalledWith(expect.stringContaining('Evicted request'));

        removeSpy.mockRestore();
    });

    test('branch false: should do nothing if request is already gone when timeout fires', () => {
        const request = createRequest(10);

        queue.add(request);

        vi.spyOn(heap, 'indexOf').mockReturnValue(-1);
        const removeSpy = vi.spyOn(heap, 'remove');

        logger.mockClear();

        vi.advanceTimersByTime(timeoutHandler.timeout);

        expect(removeSpy).not.toHaveBeenCalled();
        expect(logger).not.toHaveBeenCalled();
        expect(request.status).not.toBe(Event.EVICTED);

        removeSpy.mockRestore();
    });

    test('clearTimer should clear timeout and delete from map if timer exists', () => {
        const request = createRequest(0);

        const spyClearTimeout = vi.spyOn(global, 'clearTimeout');

        queue.add(request);

        const timersMap = (queue as any).timers;
        expect(timersMap.has(request)).toBe(true);
        const timerId = timersMap.get(request);

        queue.poll();

        expect(spyClearTimeout).toHaveBeenCalledWith(timerId);
        expect(timersMap.has(request)).toBe(false);

        spyClearTimeout.mockRestore();
    });

    test('clearTimer should do nothing if timer does not exist for the request', () => {
        const request = createRequest(0);
        const spyClearTimeout = vi.spyOn(global, 'clearTimeout');

        queue.add(request);
        const timersMap = (queue as any).timers;
        timersMap.delete(request);

        queue.poll();

        expect(spyClearTimeout).not.toHaveBeenCalled();

        spyClearTimeout.mockRestore();
    });
});
