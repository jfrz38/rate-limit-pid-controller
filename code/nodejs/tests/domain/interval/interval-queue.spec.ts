import { DefaultOptions } from "../../../src/default-parameters";
import { IntervalQueue } from "../../../src/domain/interval/interval-queue";
import { RequestInterval } from "../../../src/domain/interval/request-interval";
import { Request } from "../../../src/domain/request";
import { Event } from "../../../src/domain/events";

describe('IntervalQueue tests', () => {
    let intervalQueue: IntervalQueue;
    let requestInterval: jest.Mocked<RequestInterval>;
    const MAX_REQUESTS = 5;

    beforeEach(() => {
        requestInterval = {
            getIntervalTime: jest.fn(),
            isTimeInInterval: jest.fn(),
            getInitialTime: jest.fn()
        } as unknown as jest.Mocked<RequestInterval>;

        intervalQueue = new IntervalQueue(requestInterval, DefaultOptions.values.statistics.maxRequests);
    });

    describe('Test add', () => {
        test('when add request and is full should remove first request and add new one', () => {
            const request = {} as unknown as jest.Mocked<Request>;
            const queuedRequest = {} as unknown as jest.Mocked<Request>;

            (intervalQueue as any).maxRequests = 1;
            (intervalQueue as any).queue = [queuedRequest];

            intervalQueue.add(request);

            const queue = (intervalQueue as any).queue;

            expect(queue.length).toBe(1);
            expect(queue[0]).toBe(request);

        });

        test('when add request and is not full should add without remove any request', () => {
            const request = {} as unknown as jest.Mocked<Request>;
            const queuedRequest = {} as unknown as jest.Mocked<Request>;

            (intervalQueue as any).maxRequests = 2;
            (intervalQueue as any).queue = [queuedRequest];

            intervalQueue.add(request);

            const queue = (intervalQueue as any).queue;
            expect(queue.length).toBe(2);
            expect(queue[0]).toBe(queuedRequest);
            expect(queue[1]).toBe(request);
        });
    });

    describe('Add and Eviction Logic', () => {
        test('should add requests until it reaches maxRequests', () => {
            for (let i = 0; i < MAX_REQUESTS; i++) {
                intervalQueue.add({ priority: i } as any);
            }
            expect((intervalQueue as any).queue.length).toBe(MAX_REQUESTS);
        });

        test('should remove the oldest request (shift) when adding beyond maxRequests', () => {
            const firstRequest = { id: 'first' } as any;
            const lastRequest = { id: 'last' } as any;

            const smallQueue = new IntervalQueue(requestInterval, 1);
            smallQueue.add(firstRequest);
            smallQueue.add(lastRequest);

            const internalQueue = (smallQueue as any).queue;
            expect(internalQueue.length).toBe(1);
            expect(internalQueue[0]).toBe(lastRequest);
        });
    });

    describe('Filtering and Statistics', () => {

        test('getCompletedRequests should return only requests completed within the interval', () => {
            const reqIn = createMockRequest(100, Event.COMPLETED);
            const reqOut = createMockRequest(500, Event.COMPLETED);
            const reqNoEvent = { getEventByType: () => null } as any;

            intervalQueue.add(reqIn);
            intervalQueue.add(reqOut);
            intervalQueue.add(reqNoEvent);

            requestInterval.isTimeInInterval.mockImplementation((time) => time === 100);

            const result = intervalQueue.getCompletedRequests();

            expect(result).toHaveLength(1);
            expect(result[0]).toBe(reqIn);
        });

        test('getLatencies should calculate diff between completed and launched for successful requests', () => {
            const req = {
                hasEventCompletedAndLaunched: () => true,
                getEventByType: jest.fn((type) => {
                    if (type === Event.LAUNCHED) { return 100; }
                    if (type === Event.COMPLETED) { return 150; }
                    return null;
                })
            } as any;

            intervalQueue.add(req);

            requestInterval.isTimeInInterval.mockReturnValue(true);

            const latencies = intervalQueue.getLatencies();

            expect(latencies).toEqual([50]); // 150 - 100
        });

        test('getPriorities should return all priorities in the queue regardless of interval', () => {
            intervalQueue.add({ priority: 10 } as any);
            intervalQueue.add({ priority: 20 } as any);

            expect(intervalQueue.getPriorities()).toEqual([10, 20]);
        });
    });

    describe('Launched Requests', () => {
        test('getLaunchedRequests should return only requests launched within the interval', () => {
            const reqIn = createMockRequest(200, Event.LAUNCHED);

            const reqOut = createMockRequest(800, Event.LAUNCHED);

            const reqNoEvent = {
                getEventByType: jest.fn().mockReturnValue(null),
                priority: 1
            } as any;

            intervalQueue.add(reqIn);
            intervalQueue.add(reqOut);
            intervalQueue.add(reqNoEvent);

            requestInterval.isTimeInInterval.mockImplementation((time) => time === 200);

            const result = intervalQueue.getLaunchedRequests();

            expect(result).toHaveLength(1);
            expect(result[0]).toBe(reqIn);

            expect(requestInterval.isTimeInInterval).toHaveBeenCalledWith(200);
            expect(requestInterval.isTimeInInterval).toHaveBeenCalledWith(800);
        });

        test('getLaunchedRequests should return an empty array if no requests have been launched', () => {
            const reqNotLaunched = {
                getEventByType: jest.fn().mockReturnValue(null),
                priority: 1
            } as any;

            intervalQueue.add(reqNotLaunched);

            const result = intervalQueue.getLaunchedRequests();

            expect(result).toEqual([]);
            expect(requestInterval.isTimeInInterval).not.toHaveBeenCalled();
        });
    });

    function createMockRequest(time: number, eventType: Event): Request {
        return {
            getEventByType: jest.fn((type) => (type === eventType ? time : null)),
            priority: 1
        } as any;
    }
});
