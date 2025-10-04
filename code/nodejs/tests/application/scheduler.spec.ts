import { Scheduler } from '../../src/application/scheduler';
import { Statistics } from '../../src/application/statistics';
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
    let statisticsMock: jest.Mocked<Statistics>;
    let executorMock: { add: jest.Mock; concurrency: number };
    
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Scheduler.prototype as any, 'start').mockImplementation(() => {});
        statisticsMock = {
            add: jest.fn(),
            calculateCumulativePriorityDistribution: jest.fn().mockReturnValue(100),
        } as unknown as jest.Mocked<Statistics>;

        scheduler = new Scheduler(statisticsMock);
        executorMock = (scheduler as any).executor;

        // Silence console.error
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("Initialization", () => {
        test("should initialize with default maxConcurrentRequests", () => {
            const defaultConcurrentRequest = 10;

            expect(scheduler.getMaxConcurrentRequests()).toBe(defaultConcurrentRequest);
        });

        test("should initialize with provided maxConcurrentRequests", () => {
            const initialConcurrentRequest = 5;

            const scheduler = new Scheduler(statisticsMock, initialConcurrentRequest);

            expect(scheduler.getMaxConcurrentRequests()).toBe(initialConcurrentRequest);
        });

        test("should update maxConcurrentRequests and executor concurrency", () => {
            const newConcurrentRequests = 8;

            scheduler.updateMaxConcurrentRequests(newConcurrentRequests);

            expect(scheduler.getMaxConcurrentRequests()).toBe(newConcurrentRequests);
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

    describe("Can processing", () => {
        test('when queue has items and current request lower than maximum should return true', () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = new Request(taskMock, new Priority(1));
            
            (request as any)._status = Event.CREATED;
            (scheduler as any).queue.push(request);
            (scheduler as any).processingRequests = 0;
            (scheduler as any).maxConcurrentRequests = 100;
            
            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(true);
        });

        test('when queue has no items and current request lower than maximum should return false', () => {
            (scheduler as any).processingRequests = 0;
            (scheduler as any).maxConcurrentRequests = 100;
            
            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });

        test('when queue has items and current request higher than maximum should return false', () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = new Request(taskMock, new Priority(1));
            
            (request as any)._status = Event.CREATED;
            (scheduler as any).queue.push(request);
            (scheduler as any).processingRequests = 100;
            (scheduler as any).maxConcurrentRequests = 0;
            
            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });

        test('when queue has items and current request equal than maximum should return false', () => {
            const taskMock = jest.fn().mockResolvedValue(undefined);
            const request = new Request(taskMock, new Priority(1));
            
            (request as any)._status = Event.CREATED;
            (scheduler as any).queue.push(request);
            (scheduler as any).processingRequests = 10;
            (scheduler as any).maxConcurrentRequests = 10;
            
            const response: boolean = (scheduler as any).canProcess();

            expect(response).toBe(false);
        });
    })
});
