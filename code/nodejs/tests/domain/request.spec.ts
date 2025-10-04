import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';
import { Event } from '../../src/domain/events';

jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'mock-uuid'),
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

            expect(request.id).toBe('mock-uuid');
            expect(request.task).toBe(task);
            expect(request.priority).toBe(priority.value);
            expect(request['_status']).toBe(Event.CREATED);
            expect(request.getEventLog().has(Event.CREATED)).toBe(true);
        });
    });

    describe('status setter', () => {
        test('should update status and add entry to eventLog', () => {
            const request = new Request(task, priority);
            const now = new Date();
            jest.useFakeTimers().setSystemTime(now);

            request.status = Event.LAUNCHED;
            expect(request['_status']).toBe(Event.LAUNCHED);
            expect(request.getEventLog().get(Event.LAUNCHED)).toEqual(now);

            jest.useRealTimers();
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
            const now = new Date();
            jest.useFakeTimers().setSystemTime(now);

            request.status = Event.LAUNCHED;
            expect(request.getEventByType(Event.LAUNCHED)).toEqual(now);
            expect(request.getEventByType(Event.COMPLETED)).toBeUndefined();

            jest.useRealTimers();
        });
    });
});
