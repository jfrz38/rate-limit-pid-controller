import { beforeEach, describe, expect, Mocked, vi } from 'vitest';

import { PidController } from "../../src/application/pid-controller";
import { Scheduler } from "../../src/application/scheduler";
import { DefaultOptions } from "../../src/default-parameters";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";

describe("PidController - Recovery Behavior", () => {
    let scheduler: Mocked<Scheduler>;
    let priorityQueue: Mocked<PriorityQueue>;
    let controller: PidController;

    beforeEach(() => {
        scheduler = {} as unknown as Mocked<Scheduler>;

        priorityQueue = {
            entryRequests: 0,
            exitRequests: 0,
            length: 0,
            resetCounters: vi.fn(),
        } as unknown as Mocked<PriorityQueue>;

        controller = new PidController(
            scheduler,
            priorityQueue,
            DefaultOptions.values.pid,
            768  // initialThreshold
        );
    });

    test("threshold recovers from overload state to initial value", () => {
        // Setup: System is overloaded
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 100;
        (priorityQueue as any).length = 500; // Overloaded

        const thresholdAfterOverload = controller.updateThreshold();
        console.log(`After overload: ${thresholdAfterOverload}`);
        expect(thresholdAfterOverload).toBeLessThan(768); // Should be lower

        // Now system becomes healthy
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).length = 0; // No queue, no processing

        // Recovery should happen over multiple iterations
        let currentThreshold = thresholdAfterOverload;
        let recoveryIterations = 0;

        while (currentThreshold < 760 && recoveryIterations < 20) {
            const newThreshold = controller.updateThreshold();
            console.log(`Recovery iteration ${recoveryIterations + 1}: ${newThreshold}`);

            // Threshold should not decrease when system is healthy
            expect(newThreshold).toBeGreaterThanOrEqual(currentThreshold - 1); // Allow tiny floating point variance

            currentThreshold = newThreshold;
            recoveryIterations++;
        }

        // After several iterations, should have recovered significantly
        console.log(`Final threshold after ${recoveryIterations} recovery iterations: ${currentThreshold}`);
        expect(currentThreshold).toBeGreaterThan(thresholdAfterOverload);
        expect(recoveryIterations).toBeLessThan(20); // Should recover reasonably fast
    });

    test("threshold handles alternating load patterns", () => {
        const thresholds: number[] = [];

        // Cycle 1: Heavy overload
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 100;
        (priorityQueue as any).length = 400; // 500 total in flight
        thresholds.push(controller.updateThreshold());

        // Cycle 2: Still overloaded
        (priorityQueue as any).length = 300;
        thresholds.push(controller.updateThreshold());

        // Cycle 3: Load reducing
        (priorityQueue as any).length = 50;
        thresholds.push(controller.updateThreshold());

        // Cycle 4: Almost healthy
        (priorityQueue as any).length = 10;
        thresholds.push(controller.updateThreshold());

        // Cycle 5: Healthy
        (scheduler as any).processingRequests = 5;
        (priorityQueue as any).length = 0;
        thresholds.push(controller.updateThreshold());

        // Cycle 6: Still healthy
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).length = 0;
        thresholds.push(controller.updateThreshold());

        console.log(`Threshold progression: ${thresholds.map(t => t.toFixed(1)).join(' -> ')}`);

        // Verify the trend: decrease during overload, then increase during recovery
        expect(thresholds[0]).toBeGreaterThan(thresholds[1]); // First still decreasing
        expect(thresholds[4]).toBeGreaterThan(thresholds[3]); // Then increasing
        expect(thresholds[5]).toBeGreaterThanOrEqual(thresholds[4]); // Continues increasing or stable

        // Final threshold should be higher than the lowest
        expect(thresholds[thresholds.length - 1]).toBeGreaterThan(Math.min(...thresholds));
    });

    test("integral decay prevents lock-in at low threshold", () => {
        // Create a deeply overloaded scenario
        (scheduler as any).maxConcurrentRequests = 10;
        (scheduler as any).processingRequests = 10;
        (priorityQueue as any).length = 1000; // VERY overloaded

        // Drive threshold down significantly
        for (let i = 0; i < 10; i++) {
            controller.updateThreshold();
        }

        const thresholdAfterCrash = (controller as any).currentThreshold;
        const integralValue = (controller as any).integral;
        console.log(`After crash: threshold=${thresholdAfterCrash}, integral=${integralValue}`);

        // Now immediately remove all load
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).length = 0;

        // The integral should decay and allow recovery
        let newThreshold = controller.updateThreshold();
        const newIntegral = (controller as any).integral;
        console.log(`After first recovery attempt: threshold=${newThreshold}, integral=${newIntegral}`);

        // The integral should be smaller (decayed)
        expect(Math.abs(newIntegral)).toBeLessThan(Math.abs(integralValue));

        // Threshold should start increasing or at least not drop further
        expect(newThreshold).toBeGreaterThanOrEqual(thresholdAfterCrash - 1);
    });
});
