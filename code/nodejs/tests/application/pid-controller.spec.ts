import { PidController } from "../../src/application/pid-controller";
import { Scheduler } from "../../src/application/scheduler";
import { PriorityQueue } from "../../src/domain/priority-queue";

describe("PidController", () => {
    let schedulerMock: jest.Mocked<Scheduler>;
    let priorityQueueMock: jest.Mocked<PriorityQueue>;
    let controller: PidController;

    beforeEach(() => {
        schedulerMock = {
            getMaxConcurrentRequests: jest.fn(),
            getProcessingRequests: jest.fn(),
        } as unknown as jest.Mocked<Scheduler>;

        priorityQueueMock = {
            entryRequests: 0,
            exitRequests: 0,
        } as unknown as jest.Mocked<PriorityQueue>;

        controller = new PidController(
            schedulerMock,
            priorityQueueMock
        );

    });

    test("increases threshold when overloaded", () => {
        (schedulerMock.getMaxConcurrentRequests as jest.Mock).mockReturnValue(100);
        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(100);
        priorityQueueMock.entryRequests = 1000;
        priorityQueueMock.exitRequests = 0;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBeGreaterThan(0);
    });

    test("decreases threshold when not overloaded", () => {
        (schedulerMock.getMaxConcurrentRequests as jest.Mock).mockReturnValue(100);
        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(0);
        priorityQueueMock.entryRequests = 0;
        priorityQueueMock.exitRequests = 1000;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBe(0);
    });

    test("increases threshold on second calculation when still overloaded", () => {
        (schedulerMock.getMaxConcurrentRequests as jest.Mock).mockReturnValue(100);
        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(10);
        priorityQueueMock.entryRequests = 10000;
        priorityQueueMock.exitRequests = 1000;

        const threshold = controller.updateThreshold();

        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(80);
        priorityQueueMock.entryRequests = 100;
        priorityQueueMock.exitRequests = 10;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBeGreaterThan(threshold);
    });

    test("decreases threshold on second calculation when not overloaded", () => {
        (schedulerMock.getMaxConcurrentRequests as jest.Mock).mockReturnValue(100);
        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(10);
        priorityQueueMock.entryRequests = 10000;
        priorityQueueMock.exitRequests = 1000;

        const threshold = controller.updateThreshold();

        (schedulerMock.getProcessingRequests as jest.Mock).mockReturnValue(4);
        priorityQueueMock.entryRequests = 40;
        priorityQueueMock.exitRequests = 40;

        const newThreshold = controller.updateThreshold();
        expect(newThreshold).toBeLessThan(threshold);
    });
});
