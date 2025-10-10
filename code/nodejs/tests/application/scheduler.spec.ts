import { error } from 'console';
import { Executor } from '../../src/application/executor';
import { Scheduler } from '../../src/application/scheduler';
import { Event } from '../../src/domain/events';
import { PriorityQueue } from '../../src/domain/priority-queue/priority-queue';
import { Request } from '../../src/domain/request';

jest.mock("../../src/core/logging/logger", () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn()
    }),
}));

jest.useFakeTimers();

describe('Scheduler', () => {
    let scheduler: Scheduler;
    let queue: jest.Mocked<PriorityQueue>;
    let executor: jest.Mocked<Executor>;

    beforeEach(() => {
        jest.clearAllMocks();

        queue = {
            poll: jest.fn()
        } as unknown as jest.Mocked<PriorityQueue>;
        executor = {} as unknown as jest.Mocked<Executor>;

        scheduler = new Scheduler(queue, executor);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with default maxConcurrentRequests', () => {
            const defaultConcurrentRequest = 10;

            executor.concurrency = defaultConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            expect(scheduler.maxConcurrentRequests).toBe(defaultConcurrentRequest);
        });

        test('should initialize with provided maxConcurrentRequests', () => {
            const initialConcurrentRequest = 5;

            executor.concurrency = initialConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            expect(scheduler.maxConcurrentRequests).toBe(initialConcurrentRequest);
        });

        test('should update maxConcurrentRequests and executor concurrency', () => {
            const newConcurrentRequests = 8;

            scheduler.updateMaxConcurrentRequests(newConcurrentRequests);

            expect(scheduler.maxConcurrentRequests).toBe(newConcurrentRequests);
        });
    });

    describe('Start', () => {
        /**
         * Because the loop is infinite, tests need a way to regain control to stop it.
         * Even when testing scenarios where `canProcess()` is true, the test should
         * force `canProcess()` to return false at least once, so the loop enters
         * the `else` branch and yields control.
         * As a result, the first iteration counts as one call, and the second iteration
         * after yielding counts as another, so we expect two calls instead of one.
         */
        test('should not process any request if is not running', () => {
            (scheduler as any).isRunning = false;
            const canProcessSpy = jest.spyOn(scheduler as any, 'canProcess');
            const processRequestSpy = jest.spyOn(scheduler as any, 'processRequest');

            scheduler.start();

            expect(canProcessSpy).not.toHaveBeenCalled();
            expect(processRequestSpy).not.toHaveBeenCalled();
            expect(queue.poll).not.toHaveBeenCalled();

        });

        test('should not process any request if is running but cannot process', () => {
            const canProcessSpy = jest.spyOn(scheduler as any, 'canProcess').mockReturnValue(false);
            const processRequestSpy = jest.spyOn(scheduler as any, 'processRequest');

            scheduler.start();
            jest.advanceTimersByTime(20);
            (scheduler as any).isRunning = false;

            expect(canProcessSpy).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).not.toHaveBeenCalled();
            expect(queue.poll).not.toHaveBeenCalled();
        });

        test('should not process any request if is running but not exists', () => {
            const canProcessSpy = jest.spyOn(scheduler as any, 'canProcess').mockReturnValueOnce(true).mockReturnValue(false);
            (queue.poll as jest.Mock).mockReturnValue(undefined);
            const processRequestSpy = jest.spyOn(scheduler as any, 'processRequest');

            scheduler.start();
            (scheduler as any).isRunning = false;
            jest.advanceTimersByTime(20);

            expect(canProcessSpy).toHaveBeenCalledTimes(2);
            expect(queue.poll).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).not.toHaveBeenCalled();
        });

        test('should catch error and continue if exists any throw', () => {
            const canProcessSpy = jest.spyOn(scheduler as any, 'canProcess').mockReturnValueOnce(true).mockReturnValue(false);
            (queue.poll as jest.Mock).mockImplementation(() => { throw new Error('error'); });
            const processRequestSpy = jest.spyOn(scheduler as any, 'processRequest');

            scheduler.start();
            jest.advanceTimersByTime(20);
            (scheduler as any).isRunning = false;

            expect(canProcessSpy).toHaveBeenCalledTimes(2);
            expect(queue.poll).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).not.toHaveBeenCalled();
        });

        test('should process a request if exists and is running', () => {
            const canProcessSpy = jest.spyOn(scheduler as any, 'canProcess').mockReturnValueOnce(true).mockReturnValue(false);
            const request = {} as unknown as jest.Mocked<Request>;
            (queue.poll as jest.Mock).mockReturnValue(request);
            const processRequestSpy = jest.spyOn(scheduler as any, 'processRequest').mockImplementation(() => { });

            scheduler.start();
            jest.advanceTimersByTime(20);
            (scheduler as any).isRunning = false;

            expect(canProcessSpy).toHaveBeenCalledTimes(2);
            expect(queue.poll).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).toHaveBeenNthCalledWith(1, request);
        });
    });

    describe('Processing', () => {

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

    describe('Can processing', () => {
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
    });

    describe('Stop', () => {
        test('when process is running should stop', () => {
            (scheduler as any).isRunning = true;

            scheduler.terminate();

            const isRunning = (scheduler as any).isRunning
            expect(isRunning).toBe(false);
        });

        test('when process is stopped should stay stopped', () => {
            (scheduler as any).isRunning = false;

            scheduler.terminate();

            const isRunning = (scheduler as any).isRunning
            expect(isRunning).toBe(false);
        });
    });
});
