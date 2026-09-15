import { beforeEach, describe, expect, test, vi } from 'vitest';

import { Event } from '../../src/domain/events';
import { Priority } from '../../src/domain/priority';
import { Request } from '../../src/domain/request';

describe('Request', () => {
    beforeEach(() => vi.restoreAllMocks());

    test('records the complete successful lifecycle', () => {
        vi.spyOn(performance, 'now')
            .mockReturnValueOnce(1)
            .mockReturnValueOnce(2)
            .mockReturnValueOnce(3)
            .mockReturnValueOnce(4);
        const request = new Request(() => undefined, new Priority(1, 0));

        request.transitionTo(Event.QUEUED);
        request.transitionTo(Event.LAUNCHED);
        request.transitionTo(Event.COMPLETED);

        expect(request.status).toBe(Event.COMPLETED);
        expect(request.createdAt).toBe(1);
        expect(request.getEventTimestamp(Event.QUEUED)).toBe(2);
        expect(request.getEventTimestamp(Event.LAUNCHED)).toBe(3);
        expect(request.getEventTimestamp(Event.COMPLETED)).toBe(4);
    });

    test('rejects backwards and terminal transitions', () => {
        const request = new Request(() => undefined, new Priority(1, 0));
        request.transitionTo(Event.QUEUED);
        request.transitionTo(Event.LAUNCHED);

        expect(() => request.transitionTo(Event.QUEUED)).toThrow('Invalid request transition');

        request.transitionTo(Event.COMPLETED);
        expect(() => request.transitionTo(Event.FAILED)).toThrow('Invalid request transition');
    });

    test.each([Event.REJECTED, Event.EVICTED, Event.CANCELLED])('supports terminal state %s', (terminal) => {
        const request = new Request(() => undefined, new Priority(1, 0));
        if (terminal !== Event.REJECTED) {
            request.transitionTo(Event.QUEUED);
        }

        request.transitionTo(terminal);

        expect(request.status).toBe(terminal);
        expect(() => request.transitionTo(Event.LAUNCHED)).toThrow('Invalid request transition');
    });

    test('exposes a promise settled by the request', async () => {
        const request = new Request(() => 'ok', new Priority(1, 0));
        request.resolve('ok');
        await expect(request.promise).resolves.toBe('ok');
    });
});
