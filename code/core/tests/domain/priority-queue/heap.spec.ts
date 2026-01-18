import { describe, expect, beforeEach } from 'vitest';

import { Priority } from "../../../src/domain/priority";
import { RequestPriorityComparator } from "../../../src/domain/priority-queue/comparator";
import { Heap } from "../../../src/domain/priority-queue/heap";
import { Request } from "../../../src/domain/request";

describe('Heap', () => {

    let heap: Heap;

    beforeEach(() => {
        heap = new Heap(RequestPriorityComparator.compare());
    });

    test('add and poll returns the same request', () => {
        const request = createRequest(0);
        heap.add(request);
        expect(heap.poll()).toBe(request);
        expect(heap.poll()).toBeUndefined();
    });

    test('poll return expected priority', () => {
        const first = createRequest(0);
        const second = createRequest(1);
        const third = createRequest(1);
        const forth = createRequest(2);

        heap.addAll([first, forth, second, third]);

        expect(heap.poll()).toBe(first);
        expect(heap.poll()).toBe(second);
        expect(heap.poll()).toBe(third);
        expect(heap.poll()).toBe(forth);
        expect(heap.poll()).toBeUndefined();

    });

    test('when heap is empty should return expected values', () => {
        expect(heap.isEmpty()).toBe(true);
        expect(heap.length).toBe(0);
    });

    test('when heap is not empty should return expected values', () => {
        heap.add(createRequest(0));

        expect(heap.isEmpty()).toBe(false);
        expect(heap.length).toBe(1);
    });

    test('when heap is not empty with equal priorities should return expected values', () => {
        const first = createRequest(1);
        const second = createRequest(1);

        (first as any)._createdAt = 100;
        (second as any)._createdAt = 200;

        heap.add(second);
        heap.add(first);

        expect(heap.poll()).toBe(first);
        expect(heap.poll()).toBe(second);
    });


    function createRequest(priority: number): Request {
        return new Request(() => null, new Priority(priority, 1));
    }
});
