import { afterEach, describe, expect, test, vi } from 'vitest';

import { Event } from '../../../src/domain/events';
import { IntervalQueue } from '../../../src/domain/interval/interval-queue';
import { RequestInterval } from '../../../src/domain/interval/request-interval';
import { Priority } from '../../../src/domain/priority';
import { Request } from '../../../src/domain/request';

describe('IntervalQueue', () => {
    afterEach(() => vi.restoreAllMocks());

    test('keeps incoming priorities independently from execution samples', () => {
        const queue = new IntervalQueue(new RequestInterval(2, 30), 2);
        queue.add(requestWithPriority(1));
        queue.add(requestWithPriority(2));
        queue.add(requestWithPriority(3));

        expect(queue.getPriorities()).toEqual([256, 384]);
    });

    test('closes after minimum duration and sample count', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const queue = new IntervalQueue(new RequestInterval(2, 30), 1000);
        queue.recordSuccessful(completedRequest(0, 100));
        queue.recordSuccessful(completedRequest(100, 300));
        now.mockReturnValue(2000);

        const bucket = queue.closeExecutionBucket(2);

        expect(bucket).toMatchObject({
            successfulRequests: 2,
            averageLatency: 150,
            minimumLatency: 100,
            durationSeconds: 2,
        });
        expect(bucket?.latencies).toEqual([100, 200]);
    });

    test('does not discard recent completions at high request rates', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const queue = new IntervalQueue(new RequestInterval(2, 30), 1000);
        for (let index = 0; index < 1000; index++) {
            queue.recordSuccessful(completedRequest(index, index + 10));
        }
        now.mockReturnValue(2000);

        expect(queue.closeExecutionBucket(250)?.successfulRequests).toBe(1000);
    });

    test('forces rotation at maximum duration without enough samples', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const queue = new IntervalQueue(new RequestInterval(2, 30), 1000);
        queue.recordSuccessful(completedRequest(0, 20));
        now.mockReturnValue(30_000);

        expect(queue.closeExecutionBucket(250)?.successfulRequests).toBe(1);
        expect(queue.closeExecutionBucket(250)).toBeUndefined();
    });

    test('reports an expired empty bucket separately from an open bucket', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        const queue = new IntervalQueue(new RequestInterval(2, 30), 1000);
        now.mockReturnValue(30_000);

        expect(queue.closeExecutionBucket(250)).toBeNull();
        expect(queue.closeExecutionBucket(250)).toBeUndefined();
    });
});

function requestWithPriority(tier: number): Request {
    return new Request(() => undefined, new Priority(tier, 0));
}

function completedRequest(launched: number, completed: number): Request {
    return {
        getEventTimestamp: (event: Event) => event === Event.LAUNCHED ? launched : completed,
    } as Request;
}
