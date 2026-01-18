import { vi, describe, expect, beforeEach, Mocked } from 'vitest';

import { PidController } from "../../src/application/pid-controller";
import { Scheduler } from "../../src/application/scheduler";
import { DefaultOptions } from "../../src/default-parameters";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";

describe("PidController", () => {
    let scheduler: Mocked<Scheduler>;
    let priorityQueue: Mocked<PriorityQueue>;
    let controller: PidController;

    beforeEach(() => {
        scheduler = {} as unknown as Mocked<Scheduler>;

        priorityQueue = {
            entryRequests: 0,
            exitRequests: 0,
            resetCounters: vi.fn(),
        } as unknown as Mocked<PriorityQueue>;

        controller = new PidController(
            scheduler,
            priorityQueue,
            DefaultOptions.values.pid
        );
    });

    test("increases threshold when overloaded", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 100;
        (priorityQueue as any).entryRequests = 1000;
        (priorityQueue as any).exitRequests = 0;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBeGreaterThan(0);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(1);
    });

    test("decreases threshold when not overloaded", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).entryRequests = 0;
        (priorityQueue as any).exitRequests = 1000;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBe(0);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(1);
    });

    test("increases threshold on second calculation when still overloaded", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 10;
        (priorityQueue as any).exitRequests = 1000;
        (priorityQueue as any).entryRequests = 10000;

        const threshold = controller.updateThreshold();

        (scheduler as any).processingRequests = 80;
        (priorityQueue as any).entryRequests = 100;
        (priorityQueue as any).exitRequests = 10;

        const newThreshold = controller.updateThreshold();

        expect(newThreshold).toBeGreaterThan(threshold);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(2);
    });

    test("decreases threshold on second calculation when not overloaded", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 10;
        (priorityQueue as any).entryRequests = 10000;
        (priorityQueue as any).exitRequests = 1000;

        const threshold = controller.updateThreshold();

        (scheduler as any).processingRequests = 4;
        (priorityQueue as any).entryRequests = 40;
        (priorityQueue as any).exitRequests = 40;

        const newThreshold = controller.updateThreshold();

        expect(newThreshold).toBeLessThan(threshold);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(2);
    });

    test("increases threshold above limit should set as maximum threshold", () => {
        const maximumThreshold = 100;

        (scheduler as any).maxConcurrentRequests = 10;
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).entryRequests = 1000;
        (priorityQueue as any).exitRequests = 0;

        (controller as any).currentThreshold = 95;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBe(maximumThreshold);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(1);
    });

    test("decreases threshold under limit should set as minimum threshold", () => {
        const minimumThreshold = 0;

        (scheduler as any).maxConcurrentRequests = 10;
        (scheduler as any).processingRequests = 10;
        (priorityQueue as any).entryRequests = 0;
        (priorityQueue as any).exitRequests = 1000;

        (controller as any).currentThreshold = 1;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBe(minimumThreshold);
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(1);
    });

    test("should reset priority queue counters after updating threshold", () => {
        controller.updateThreshold();
        expect(priorityQueue.resetCounters).toHaveBeenCalledTimes(1);
    });

    test("should handle zero exit requests without returning NaN", () => {
        (scheduler as any).maxConcurrentRequests = 10;
        (scheduler as any).processingRequests = 10;
        (priorityQueue as any).entryRequests = 10;
        (priorityQueue as any).exitRequests = 0;

        const newThreshold = controller.updateThreshold();

        expect(isNaN(newThreshold)).toBe(false);
        expect(isFinite(newThreshold)).toBe(true);
    });

    test("should decrease threshold when entry rate is low but scheduler has free capacity", () => {
        (controller as any).currentThreshold = 50;

        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 20;
        (priorityQueue as any).entryRequests = 10;
        (priorityQueue as any).exitRequests = 5;

        const newThreshold = controller.updateThreshold();

        expect(newThreshold).toBeLessThan(50);
    });

    test("should increase threshold more aggressively when error is larger", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 100;
        (priorityQueue as any).exitRequests = 10;

        (priorityQueue as any).entryRequests = 110;
        const jumpSmall = controller.updateThreshold();

        (controller as any).currentThreshold = 0;

        (priorityQueue as any).entryRequests = 500;
        const jumpLarge = controller.updateThreshold();

        expect(jumpLarge).toBeGreaterThan(jumpSmall);
    });
});
