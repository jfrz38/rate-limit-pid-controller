import { vi, describe, expect, beforeEach, Mock, Mocked } from 'vitest';

import EventEmitter from 'events';
import { Executor } from '../../src/application/executor';
import { Scheduler } from '../../src/application/scheduler';
import { Event } from '../../src/domain/events';
import { PriorityQueue } from '../../src/domain/priority-queue/priority-queue';
import { Request } from '../../src/domain/request';

vi.mock("../../src/core/logging/logger", () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn()
    }),
}));

vi.useFakeTimers();

describe('Scheduler', () => {
    let scheduler: Scheduler;
    let queue: Mocked<PriorityQueue>;
    let executor: Mocked<Executor>;
    let emitter: Mocked<EventEmitter>;

    beforeEach(() => {
        vi.clearAllMocks();

        emitter = {
            on: vi.fn(),
            emit: vi.fn(),
            removeAllListeners: vi.fn()
        } as unknown as Mocked<EventEmitter>;

        queue = {
            on: vi.fn().mockImplementation((ev, cb) => emitter.on(ev, cb)),
            emit: vi.fn().mockImplementation((ev, ...args) => emitter.emit(ev, ...args)),
            poll: vi.fn(),
            removeAllListeners: vi.fn().mockImplementation((ev) => emitter.removeAllListeners(ev)),
            length: 0
        } as any as Mocked<PriorityQueue>;

        executor = {
            concurrency: 10,
            add: vi.fn()
        } as unknown as Mocked<Executor>;

        scheduler = new Scheduler(queue, executor);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Initialization & Events', () => {
        test('should start listening to requestAdded on start()', () => {
            const addListenerSpy = vi.spyOn(queue, 'on');
            scheduler.start();
            expect(addListenerSpy).toHaveBeenCalledWith('requestAdded', expect.any(Function));
        });

        test('should remove listeners on terminate()', () => {
            const removeSpy = vi.spyOn(queue, 'removeAllListeners');
            scheduler.terminate();
            expect(removeSpy).toHaveBeenCalledWith('requestAdded');
        });
    });

    describe('Initialization', () => {
        test('should initialize with default maxConcurrentRequests', () => {
            const defaultConcurrentRequest = 10;

            executor.concurrency = defaultConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            const concurrentRequests = scheduler.maxConcurrentRequests;
            expect(concurrentRequests).toBe(defaultConcurrentRequest);
        });

        test('should initialize with provided maxConcurrentRequests', () => {
            const initialConcurrentRequest = 5;

            executor.concurrency = initialConcurrentRequest;

            const scheduler = new Scheduler(queue, executor);

            const concurrentRequests = scheduler.maxConcurrentRequests;
            expect(concurrentRequests).toBe(initialConcurrentRequest);
        });

        test('should update maxConcurrentRequests and executor concurrency', () => {
            const newConcurrentRequests = 8;

            scheduler.updateMaxConcurrentRequests(newConcurrentRequests);

            const concurrentRequests = scheduler.maxConcurrentRequests;
            expect(concurrentRequests).toBe(newConcurrentRequests);
        });
    });

    describe('Start', () => {   
        test('should not process requests if start has not been called (not listening)', () => {
            const request = { status: Event.CREATED } as any;
            (queue as any).length = 1;
            queue.poll.mockReturnValue(request);

            (queue as any).emit('requestAdded');

            expect(executor.add).not.toHaveBeenCalled();
            expect(request.status).not.toBe(Event.LAUNCHED);
        });

        test('should not process any request if is running but cannot process', () => {
            const canProcessSpy = vi.spyOn(scheduler as any, 'canProcess').mockReturnValue(false);
            const processRequestSpy = vi.spyOn(scheduler as any, 'processRequest');

            scheduler.start();
            vi.advanceTimersByTime(20);
            (scheduler as any).isRunning = false;

            expect(canProcessSpy).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).not.toHaveBeenCalled();
            expect(queue.poll).not.toHaveBeenCalled();
        });

        test('should not process any request if is running but not exists', () => {
            const canProcessSpy = vi.spyOn(scheduler as any, 'canProcess').mockReturnValueOnce(true).mockReturnValue(false);
            (queue.poll as Mock).mockReturnValue(undefined);
            const processRequestSpy = vi.spyOn(scheduler as any, 'processRequest');

            scheduler.start();
            (scheduler as any).isRunning = false;
            vi.advanceTimersByTime(20);

            expect(canProcessSpy).toHaveBeenCalledTimes(1);
            expect(queue.poll).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).not.toHaveBeenCalled();
        });

        test('should process a request if exists and is running', () => {
            const canProcessSpy = vi.spyOn(scheduler as any, 'canProcess').mockReturnValueOnce(true).mockReturnValue(false);
            const request = {} as unknown as Mocked<Request>;
            (queue.poll as Mock).mockReturnValue(request);
            const processRequestSpy = vi.spyOn(scheduler as any, 'processRequest').mockImplementation(() => { });

            scheduler.start();
            vi.advanceTimersByTime(20);
            (scheduler as any).isRunning = false;

            expect(canProcessSpy).toHaveBeenCalledTimes(2);
            expect(queue.poll).toHaveBeenCalledTimes(1);
            expect(processRequestSpy).toHaveBeenNthCalledWith(1, request);
        });
    });

    describe('Processing', () => {

        test('should add a request when exists', async () => {
            const taskMock = vi.fn().mockResolvedValue(undefined);
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = vi.fn().mockResolvedValue(undefined as any);
            await (scheduler as any).processRequest(request);

            expect(executor.add).toHaveBeenCalledTimes(1);
        });

        test('should mark request as COMPLETED on success', async () => {
            const taskMock = vi.fn().mockResolvedValue(undefined);
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = vi.fn(async (fn: () => Promise<any>) => await fn()) as unknown as typeof executor.add;

            await (scheduler as any).processRequest(request);

            expect(taskMock).toHaveBeenCalledTimes(1);
            expect(request.status).toBe(Event.COMPLETED);
            expect(scheduler.processingRequests).toBe(0);
            expect(executor.add).toHaveBeenCalledTimes(1);
        });

        test('should mark request as FAILED on error', async () => {
            const taskMock = vi.fn().mockRejectedValue(new Error('fail'));
            const request = { task: taskMock, status: Event.CREATED };

            executor.add = vi.fn(async (fn: () => Promise<any>) => await fn()) as unknown as typeof executor.add;

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

    describe('Scheduling Logic', () => {
        test('should drain multiple requests when requestAdded is emitted', () => {
            (queue as any).length = 2;
            queue.poll
                .mockReturnValueOnce({ status: Event.CREATED } as any)
                .mockReturnValueOnce({ status: Event.CREATED } as any)
                .mockReturnValue(null);

            scheduler.start();
            (queue as any).emit('requestAdded');

            expect(executor.add).toHaveBeenCalledTimes(2);
            expect(scheduler.processingRequests).toBe(2);
        });

        test('should respect maxConcurrentRequests limit', () => {
            (scheduler as any)._maxConcurrentRequests = 1;
            (queue as any).length = 5;
            queue.poll.mockReturnValue({ status: Event.CREATED } as any);

            (scheduler as any).schedule();

            expect(executor.add).toHaveBeenCalledTimes(1);
            expect(scheduler.processingRequests).toBe(1);
        });
    });

    describe('Lifecycle & Flow Control', () => {

        test('should start processing immediately if requests are already in queue when start() is called', () => {
            const request = { status: Event.CREATED } as any;
            (queue as any).length = 1;
            queue.poll.mockReturnValue(request);
            const scheduleSpy = vi.spyOn(scheduler as any, 'schedule');

            scheduler.start();

            expect(scheduleSpy).toHaveBeenCalled();
            expect(executor.add).toHaveBeenCalled();
        });

        test('should stop reacting to new requests after terminate() is called', () => {
            scheduler.start();
            scheduler.terminate();

            (queue as any).emit('requestAdded');

            expect(queue.poll).not.toHaveBeenCalled();
        });

        test('should handle empty queue during schedule() gracefully (break loop)', () => {
            (queue as any).length = 5;
            queue.poll.mockReturnValue(null); 

            (scheduler as any).schedule();

            expect(executor.add).not.toHaveBeenCalled();
        });

        test('should log error and continue if a task fails', () => {
            const request = {
                task: vi.fn().mockRejectedValue(new Error('Async Error')),
                status: Event.CREATED,
                priority: 1
            } as any;

            (queue as any).length = 1;
            queue.poll.mockReturnValue(request);

            executor.add.mockImplementation(async (taskFn: any) => {
                await taskFn();
                expect(request.status).toBe(Event.FAILED);
                expect(scheduler.processingRequests).toBe(0);
            });

            (scheduler as any).schedule();
        });
    });

});
