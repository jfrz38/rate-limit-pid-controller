import { beforeEach, describe, expect, Mock, Mocked, vi } from 'vitest';

import { Event } from '../../src/domain/events';
import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';

const RANDOM_UUID_MOCK = 'uuid';
vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => RANDOM_UUID_MOCK),
}));

describe('Request', () => {
    let task: Mock;
    let priority: Mocked<Priority>;

    beforeEach(() => {
        task = vi.fn();
        priority = {} as unknown as Mocked<Priority>;
    });

    describe('constructor', () => {
        test('should set id, task, priority, and initial status', () => {
            const request = new Request(task, priority);

            expect(request.id).toBe(RANDOM_UUID_MOCK);
            expect(request.task).toBe(task);
            expect(request.priority).toBe(priority.value);
            expect(request['_status']).toBe(Event.CREATED);
            expect((request as any).eventLog.has(Event.CREATED)).toBe(true);
        });
    });

    describe('status getter & setter', () => {
        test('should update status and add entry to eventLog', () => {
            const request = new Request(task, priority);
            const now = performance.now();

            const spy = vi.spyOn(performance, 'now').mockReturnValue(now);

            request.status = Event.LAUNCHED;
            expect(request['_status']).toBe(Event.LAUNCHED);
            expect((request as any).eventLog.get(Event.LAUNCHED)).toEqual(now);

            spy.mockRestore();
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
            const spy = vi.spyOn(performance, 'now').mockReturnValue(startTime);
            const request = new Request(task, priority);
            
            vi.spyOn(performance, 'now').mockReturnValue(startTime + 5000);
            request.status = Event.LAUNCHED;
            
            expect(request.createdAt).toBe(startTime);
            
            spy.mockRestore();
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

        test('getEventTimestamp should return the correct Date', () => {
            const request = new Request(task, priority);
            const now = performance.now();
            
            const spy = vi.spyOn(performance, 'now').mockReturnValue(now);
            
            request.status = Event.LAUNCHED;
            
            expect(request.getEventTimestamp(Event.LAUNCHED)).toEqual(now);
            expect(request.getEventTimestamp(Event.COMPLETED)).toBeUndefined();
            
            spy.mockRestore();
        });

        test('eventLog should store the latest timestamp if the same status is set twice', () => {
            vi.useFakeTimers();
            const request = new Request(task, priority);

            vi.setSystemTime(1000);
            const firstSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
            request.status = Event.LAUNCHED;
            
            const secondSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);
            vi.setSystemTime(2000);
            request.status = Event.LAUNCHED;
            
            expect(request.getEventTimestamp(Event.LAUNCHED)).toBe(2000);

            firstSpy.mockRestore();
            secondSpy.mockRestore();
        });

        test('should maintain a history of all status changes', () => {
            const request = new Request(task, priority);
            request.status = Event.QUEUED;
            request.status = Event.LAUNCHED;
            request.status = Event.COMPLETED;

            const log = (request as any).eventLog;
            expect(log.has(Event.CREATED)).toBe(true);
            expect(log.has(Event.QUEUED)).toBe(true);
            expect(log.has(Event.LAUNCHED)).toBe(true);
            expect(log.has(Event.COMPLETED)).toBe(true);
            expect(log.size).toBe(4);
        });
    });
});
