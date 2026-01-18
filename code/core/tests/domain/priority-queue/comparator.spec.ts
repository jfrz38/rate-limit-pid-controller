import { describe, expect } from 'vitest';

import { RequestPriorityComparator } from "../../../src/domain/priority-queue/comparator";
import { Request } from "../../../src/domain/request";

describe('RequestPriorityComparator tests', () => {
    const compare = RequestPriorityComparator.compare();

    describe('Test comparison', () => {
        test('should return a negative number if priority of A is lower than B (A is more urgent)', () => {
            const requestA = { priority: 1, createdAt: 1000 } as Request;
            const requestB = { priority: 10, createdAt: 1000 } as Request;

            const result = compare(requestA, requestB);

            expect(result).toBeLessThan(0);
        });

        test('should return a positive number if priority of A is higher than B (B is more urgent)', () => {
            const requestA = { priority: 5, createdAt: 1000 } as Request;
            const requestB = { priority: 2, createdAt: 1000 } as Request;

            const result = compare(requestA, requestB);

            expect(result).toBeGreaterThan(0);
        });

        test('should sort an array from most urgent (0) to least urgent (N)', () => {
            const r1 = { priority: 10, createdAt: 100 } as Request;
            const r2 = { priority: 0, createdAt: 150 } as Request;
            const r3 = { priority: 0, createdAt: 50 } as Request;

            const list = [r1, r2, r3];
            list.sort(compare);

            expect(list).toEqual([r3, r2, r1]);
        });
    });




    describe('Tie-breaking with createdAt (FIFO)', () => {
        test('should return a negative number if priorities are equal but A was created earlier', () => {
            const requestA = { priority: 5, createdAt: 100 } as Request;
            const requestB = { priority: 5, createdAt: 200 } as Request;

            const result = compare(requestA, requestB);

            expect(result).toBeLessThan(0);
        });

        test('should return a positive number if priorities are equal but B was created earlier', () => {
            const requestA = { priority: 5, createdAt: 300 } as Request;
            const requestB = { priority: 5, createdAt: 150 } as Request;

            const result = compare(requestA, requestB);

            expect(result).toBeGreaterThan(0);
        });

        test('should return 0 if both priority and createdAt are identical', () => {
            const requestA = { priority: 5, createdAt: 500 } as Request;
            const requestB = { priority: 5, createdAt: 500 } as Request;

            const result = compare(requestA, requestB);

            expect(result).toBe(0);
        });
    });
});
