import { Executor } from '../../src/application/executor';
import { Scheduler } from '../../src/application/scheduler';
import { Event } from '../../src/domain/events';
import { PriorityQueue } from '../../src/domain/priority-queue';

describe("Scheduler", () => {
    let scheduler: Scheduler;
    let queue: jest.Mocked<PriorityQueue>;
    let executor: jest.Mocked<Executor>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Scheduler.prototype as any, 'start').mockImplementation(() => { });

        queue = {} as unknown as jest.Mocked<PriorityQueue>;
        executor = {} as unknown as jest.Mocked<Executor>;

        scheduler = new Scheduler(queue, executor);

        // Silence console.error
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("Initialization", () => {
        test("should initialize with default maxConcurrentRequests", () => {
            const defaultConcurrentRequest = 10;

            executor.concurrency = defaultConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            expect(scheduler.maxConcurrentRequests).toBe(defaultConcurrentRequest);
        });

        test("should initialize with provided maxConcurrentRequests", () => {
            const initialConcurrentRequest = 5;

            executor.concurrency = initialConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            expect(scheduler.maxConcurrentRequests).toBe(initialConcurrentRequest);
        });

        test("should update maxConcurrentRequests and executor concurrency", () => {
            const newConcurrentRequests = 8;

            scheduler.updateMaxConcurrentRequests(newConcurrentRequests);

            expect(scheduler.maxConcurrentRequests).toBe(newConcurrentRequests);
        });
    });

    describe("Processing", () => {

        test('should add a request when exists', async () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = jest.fn();
            await (scheduler as any).processRequest(request);

            expect(executor.add).toHaveBeenCalledTimes(1);
        })

        test('should mark request as COMPLETED on success', async () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = jest.fn(async (fn: () => Promise<any>) => await fn()) as unknown as typeof executor.add;

            await (scheduler as any).processRequest(request);

            expect(taskMock).toHaveBeenCalledTimes(1);
            expect(request.status).toBe(Event.COMPLETED);
            expect(scheduler.processingRequests).toBe(0);
            expect(executor.add).toHaveBeenCalledTimes(1);
        });

        test('should mark request as FAILED on error', async () => {
            const taskMock = jest.fn().mockRejectedValue(new Error('fail'));
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = jest.fn(async (fn: () => Promise<any>) => await fn()) as unknown as typeof executor.add;

            await (scheduler as any).processRequest(request);

            expect(taskMock).toHaveBeenCalledTimes(1);
            expect(request.status).toBe(Event.FAILED);
            expect(scheduler.processingRequests).toBe(0);
            expect(executor.add).toHaveBeenCalledTimes(1);
        });
    });

    describe("Can processing", () => {
        test('when queue has items and current request lower than maximum should return true', () => {
            (queue as any).length = 1;
            (scheduler as any)._processingRequests = 0;
            (scheduler as any)._maxConcurrentRequests = 100;

            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(true);
        });

        test('when queue has no items and current request lower than maximum should return false', () => {
            (queue as any).length = 0;
            (scheduler as any)._processingRequests = 0;
            (scheduler as any)._maxConcurrentRequests = 100;

            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });

        test('when queue has items and current request higher than maximum should return false', () => {
            (queue as any).length = 1;
            (scheduler as any)._processingRequests = 100;
            (scheduler as any)._maxConcurrentRequests = 0;

            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });

        test('when queue has items and current request equal than maximum should return false', () => {
            (queue as any).length = 1;
            (scheduler as any)._processingRequests = 10;
            (scheduler as any)._maxConcurrentRequests = 10;

            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });
    })
});
