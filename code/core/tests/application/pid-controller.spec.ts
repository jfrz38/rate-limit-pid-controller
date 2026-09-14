import { beforeEach, describe, expect, Mocked, vi } from 'vitest';

import { PidController } from "../../src/application/pid-controller";
import { Scheduler } from "../../src/application/scheduler";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";

vi.mock("../../src/core/logging/logger", () => ({
    getLogger: vi.fn().mockReturnValue({
        debug: vi.fn()
    }),
}));

describe("PidController (Real PID Logic)", () => {
    let scheduler: Mocked<Scheduler>;
    let priorityQueue: Mocked<PriorityQueue>;
    let controller: PidController;

    const mockPidConfig = {
        KP: 1.0,
        KI: 0.1,
        KD: 0.01,
        interval: 1000,
        delta: 20,
        decayRatio: 0.8
    };

    beforeEach(() => {
        scheduler = {
            maxConcurrentRequests: 100,
            processingRequests: 0,
        } as unknown as Mocked<Scheduler>;

        priorityQueue = {
            length: 0,
        } as unknown as Mocked<PriorityQueue>;

        controller = new PidController(
            scheduler,
            priorityQueue,
            mockPidConfig
        );
    });

    describe('Initial values', () => {
        test('dt should be interval value in seconds', () => {
            const newInterval = 8000;
            const expectedDt = 8;
            const config = { ...mockPidConfig, interval: newInterval };

            const pid = new PidController(scheduler, priorityQueue, config);

            const dt = (pid as any).DT;
            expect(dt).toBe(expectedDt);
        });

        test.each([
            { value: -1, expected: 0 },
            { value: 101, expected: 100 },
            { value: 20, expected: 20 },
            { value: 0, expected: 0 },
            { value: 100, expected: 100 }
        ])('when delta value is %value should be in range and be $expected', ({ value, expected }) => {
            const config = { ...mockPidConfig, delta: value };

            const pid = new PidController(scheduler, priorityQueue, config);

            const delta = (pid as any).MAX_DELTA_PERCENT;
            expect(delta).toBe(expected);
        });

    });

    describe("Overload (controlError > 0)", () => {
        test("should decrease threshold when system is overloaded", () => {
            (scheduler as any).processingRequests = 100;
            (priorityQueue as any).length = 50;

            const initialThreshold = 100;
            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBeLessThan(initialThreshold);
        });

        test("should not exceed MAX_DELTA_PERCENT per iteration", () => {
            (scheduler as any).processingRequests = 100;
            (priorityQueue as any).length = 3000;

            const maxAllowedChange = mockPidConfig.delta * (mockPidConfig.interval / 1000);
            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBe(100 - maxAllowedChange);
        });

        test("should clamp to MIN_THRESHOLD (0)", () => {
            (controller as any).currentThreshold = 5;

            (scheduler as any).maxConcurrentRequests = 100;
            (scheduler as any).processingRequests = 1000;

            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBe(0);
        });
    });

    describe("Recovery (controlError <= 0)", () => {
        beforeEach(() => {
            (controller as any).currentThreshold = 50;
        });

        test("should increase threshold when system is underused", () => {
            (scheduler as any).processingRequests = 50;
            (priorityQueue as any).length = 0;

            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBeGreaterThan(50);
        });

        test("should apply integral decay during recovery", () => {
            (controller as any).integral = 10.0;

            (scheduler as any).processingRequests = 50;
            controller.updateThreshold();

            expect((controller as any).integral).toBeLessThan(10.0);
        });

        test("should clamp to MAX_THRESHOLD (100)", () => {
            (controller as any).currentThreshold = 99;

            (scheduler as any).maxConcurrentRequests = 100;
            (scheduler as any).processingRequests = 0;
            (priorityQueue as any).length = 0;

            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBe(100);
        });

        test("should not update threshold if delta is 0 during recovery", () => {
            (controller as any).currentThreshold = 50;

            (scheduler as any).maxConcurrentRequests = 100;
            (scheduler as any).processingRequests = 100;
            (priorityQueue as any).length = 0;

            (controller as any).integral = 0;
            (controller as any).previousError = 0;

            const newThreshold = controller.updateThreshold();

            expect(newThreshold).toBe(50);
        });
    });

    describe("PID Terms", () => {
        test("should update previousError for derivative calculation in next iteration", () => {
            (scheduler as any).processingRequests = 150;
            controller.updateThreshold();

            expect((controller as any).previousError).toBe(0.5);
        });

        test("should accumulate error in integral term", () => {
            (scheduler as any).processingRequests = 150;
            const dt = mockPidConfig.interval / 1000;

            controller.updateThreshold();

            expect((controller as any).integral).toBe(0.5 * dt);
        });

        test('uses finite queue counters for the production control error and resets them', () => {
            const resetCounters = vi.fn();
            const finiteQueue = {
                entryRequests: 10,
                exitRequests: 4,
                length: 0,
                resetCounters,
            } as unknown as Mocked<PriorityQueue>;
            const finiteScheduler = {
                maxConcurrentRequests: 10,
                processingRequests: 6,
            } as unknown as Mocked<Scheduler>;
            const pid = new PidController(finiteScheduler, finiteQueue, {
                ...mockPidConfig,
                KP: 1,
                KI: 0,
                KD: 0,
                interval: 500,
            });

            expect(pid.updateThreshold()).toBe(99.5);
            expect(resetCounters).toHaveBeenCalledTimes(1);
        });

        test('does not integrate error that pushes an already saturated threshold outward', () => {
            const pid = new PidController(scheduler, priorityQueue, {
                ...mockPidConfig,
                KP: 0,
                KI: 1,
                KD: 0,
                interval: 500,
            });
            pid['currentThreshold'] = 0;

            pid['thresholdForSystemOverloaded'](1);

            expect(pid['integral']).toBe(0);
        });

        test('applies delta as a per-iteration limit independently of PID interval', () => {
            const pid = new PidController(scheduler, priorityQueue, {
                ...mockPidConfig,
                KP: 10,
                KI: 0,
                KD: 0,
                interval: 100,
                delta: 10,
            });

            expect(pid['thresholdForSystemOverloaded'](100)).toBe(90);
        });
    });

    describe("Stability", () => {
        test("should not change threshold if error is negligible (< 0.01) during overload", () => {
            (controller as any).currentThreshold = 80;
            (scheduler as any).maxConcurrentRequests = 100;
            (scheduler as any).processingRequests = 100;
            (priorityQueue as any).length = 0.5;

            const newThreshold = controller.updateThreshold();
            expect(newThreshold).toBe(80);
        });
    });
});
