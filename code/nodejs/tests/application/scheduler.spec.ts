import { Scheduler } from '../../src/application/scheduler';
import { Event } from '../../src/domain/events';
import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';

jest.mock("../../src/domain/priority-queue", () => {
    return {
        PriorityQueue: jest.fn().mockImplementation((opts) => ({
            add: jest.fn((fn: any) => fn()),
            concurrency: opts.concurrency
        }))
    };
});

describe("Scheduler", () => {
    let scheduler: Scheduler;
    let executorMock: { add: jest.Mock; concurrency: number };
    
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Scheduler.prototype as any, 'start').mockImplementation(() => {});
        scheduler = new Scheduler();
        executorMock = (scheduler as any).executor;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("Initialization", () => {
        test("should initialize with default maxConcurrentRequests", () => {
            const defaultConcurrentRequest = 10;

            expect(scheduler.getMaxConcurrentRequests()).toBe(defaultConcurrentRequest);
            expect((scheduler as any).executor.concurrency).toBe(defaultConcurrentRequest);
        });

        test("should initialize with provided maxConcurrentRequests", () => {
            const initialConcurrentRequest = 5;

            const scheduler = new Scheduler(initialConcurrentRequest);

            expect(scheduler.getMaxConcurrentRequests()).toBe(initialConcurrentRequest);
            expect((scheduler as any).executor.concurrency).toBe(initialConcurrentRequest);
        });

        test("should update maxConcurrentRequests and executor concurrency", () => {
            const newConcurrentRequests = 8;

            scheduler.updateMaxConcurrentRequests(newConcurrentRequests);

            expect(scheduler.getMaxConcurrentRequests()).toBe(newConcurrentRequests);
            expect(executorMock.concurrency).toBe(newConcurrentRequests);
        });
    });

    describe("Processing", () => {
        test('should mark request as COMPLETED on success', async () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = new Request(taskMock, new Priority(1));
            (request as any)._status = Event.CREATED;

            (scheduler as any).queue.push(request);

            await (scheduler as any).processRequest();

            expect(taskMock).toHaveBeenCalledTimes(1);
            expect((request as any)._status).toBe(Event.COMPLETED);
            expect(scheduler.getProcessingRequests()).toBe(0);
            expect(executorMock.add).toHaveBeenCalledTimes(1);
        });

        test('should mark request as FAILED if task throws', async () => {
            const taskMock = jest.fn().mockRejectedValue(new Error('fail'));
            const request = new Request(taskMock, new Priority(1));
            (request as any)._status = Event.CREATED;

            (scheduler as any).queue.push(request);

            await (scheduler as any).processRequest();

            expect(taskMock).toHaveBeenCalledTimes(1);
            expect((request as any)._status).toBe(Event.FAILED);
            expect(scheduler.getProcessingRequests()).toBe(0);
            expect(executorMock.add).toHaveBeenCalledTimes(1);
        });
    });
});
