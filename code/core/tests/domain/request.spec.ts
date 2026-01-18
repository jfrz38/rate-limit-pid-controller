import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';
import { Event } from '../../src/domain/events';

const RANDOM_UUID_MOCK = 'uuid';
jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => RANDOM_UUID_MOCK),
}));

describe('Request', () => {
    let task: jest.Mock;
    let priority: jest.Mocked<Priority>;

    beforeEach(() => {
        task = jest.fn();
        priority = {} as unknown as jest.Mocked<Priority>;
    });

    describe('constructor', () => {
        test('should set id, task, priority, and initial status', () => {
            const request = new Request(task, priority);

            expect(request.id).toBe(RANDOM_UUID_MOCK);
            expect(request.task).toBe(task);
            expect(request.priority).toBe(priority.value);
            expect(request['_status']).toBe(Event.CREATED);
            expect(request.getEventLog().has(Event.CREATED)).toBe(true);
        });
    });

    describe('status getter & setter', () => {
        test('should update status and add entry to eventLog', () => {
            const request = new Request(task, priority);
            const now = Date.now();

            jest.useFakeTimers().setSystemTime(now);

            request.status = Event.LAUNCHED;
            expect(request['_status']).toBe(Event.LAUNCHED);
            expect(request.getEventLog().get(Event.LAUNCHED)).toEqual(now);

            jest.useRealTimers();
        });

        test('when request is created should return expected status', () => {
            const request = new Request(task, priority);

            const status = request.status;

            expect(status).toBe(Event.CREATED);
        });

        test('when status is updated should return expected status', () => {
            const request = new Request(task, priority);
            const newStatus = Event.QUEUED;

            request.status = newStatus;
            const currentStatus = request.status;

            expect(currentStatus).toBe(newStatus);
        });

        test('createdAt should be immutable after instantiation', () => {
            const startTime = 1000;
            jest.useFakeTimers().setSystemTime(startTime);
            const request = new Request(task, priority);

            jest.advanceTimersByTime(5000);
            request.status = Event.LAUNCHED;

            expect(request.createdAt).toBe(startTime);
        });

    });

    describe('event log helpers', () => {
        test('hasEventCreatedAndCompleted should return true only if both events exist', () => {
            const request = new Request(task, priority);
            expect(request.hasEventCreatedAndCompleted()).toBe(false);

            request.status = Event.COMPLETED;
            expect(request.hasEventCreatedAndCompleted()).toBe(true);
        });

        test('hasEventCompletedAndLaunched should return true only if both events exist', () => {
            const request = new Request(task, priority);
            expect(request.hasEventCompletedAndLaunched()).toBe(false);

            request.status = Event.LAUNCHED;
            expect(request.hasEventCompletedAndLaunched()).toBe(false);

            request.status = Event.COMPLETED;
            expect(request.hasEventCompletedAndLaunched()).toBe(true);
        });

        test('getEventByType should return the correct Date', () => {
            const request = new Request(task, priority);
            const now = Date.now();
            jest.useFakeTimers().setSystemTime(now);

            request.status = Event.LAUNCHED;
            expect(request.getEventByType(Event.LAUNCHED)).toEqual(now);
            expect(request.getEventByType(Event.COMPLETED)).toBeUndefined();

            jest.useRealTimers();
        });

        test('eventLog should store the latest timestamp if the same status is set twice', () => {
            jest.useFakeTimers();
            const request = new Request(task, priority);

            jest.setSystemTime(1000);
            request.status = Event.LAUNCHED;

            jest.setSystemTime(2000);
            request.status = Event.LAUNCHED;

            expect(request.getEventByType(Event.LAUNCHED)).toBe(2000);
            jest.useRealTimers();
        });

        test('should maintain a history of all status changes', () => {
            const request = new Request(task, priority);
            request.status = Event.QUEUED;
            request.status = Event.LAUNCHED;
            request.status = Event.COMPLETED;

            const log = request.getEventLog();
            expect(log.has(Event.CREATED)).toBe(true);
            expect(log.has(Event.QUEUED)).toBe(true);
            expect(log.has(Event.LAUNCHED)).toBe(true);
            expect(log.has(Event.COMPLETED)).toBe(true);
            expect(log.size).toBe(4);
        });
    });
});
