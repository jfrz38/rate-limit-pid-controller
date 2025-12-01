import { PidController } from "../../src/application/pid-controller";
import { Scheduler } from "../../src/application/scheduler";
import { DefaultOptions } from "../../src/default-parameters";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";

describe("PidController", () => {
    let scheduler: jest.Mocked<Scheduler>;
    let priorityQueue: jest.Mocked<PriorityQueue>;
    let controller: PidController;

    beforeEach(() => {
        scheduler = {} as unknown as jest.Mocked<Scheduler>;

        priorityQueue = {
            entryRequests: 0,
            exitRequests: 0,
        } as unknown as jest.Mocked<PriorityQueue>;

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
    });

    test("decreases threshold when not overloaded", () => {
        (scheduler as any).maxConcurrentRequests = 100;
        (scheduler as any).processingRequests = 0;
        (priorityQueue as any).entryRequests = 0;
        (priorityQueue as any).exitRequests = 1000;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBe(0);
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
    });
});
