import { AutoTuner } from "../src/application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../src/application/auto-tuner/latency.controller";
import { Executor } from "../src/application/executor";
import { PidController } from "../src/application/pid-controller";
import { Rejector } from "../src/application/rejector";
import { Scheduler } from "../src/application/scheduler";
import { Statistics } from "../src/application/statistics";
import { Priority } from "../src/domain/priority";
import { PriorityQueue } from "../src/domain/priority-queue/priority-queue";
import { Request } from "../src/domain/request";
import { PidControllerRateLimit } from "../src/pid-controller-rate-limit";
import { Heap } from "../src/domain/priority-queue/heap";
import { RequestPriorityComparator } from "../src/domain/priority-queue/comparator";

jest.mock("../src/application/statistics");
jest.mock("../src/domain/priority-queue/priority-queue");
jest.mock("../src/application/scheduler");
jest.mock("../src/application/pid-controller");
jest.mock("../src/application/rejector");
jest.mock("../src/application/auto-tuner/auto-tuner");
jest.mock("../src/application/auto-tuner/concurrency.controller");
jest.mock("../src/application/auto-tuner/latency.controller");
jest.mock("../src/domain/request");
jest.mock("../src/domain/priority");
jest.mock('../src/application/executor', () => {
    return {
        Executor: jest.fn()
    }
});
jest.mock("../src/domain/request");
jest.mock("../src/domain/priority-queue/heap");
jest.mock("../src/domain/priority-queue/comparator");

describe('PidControllerRateLimit (mocked)', () => {
    let task: jest.Mock;

    let controller: PidControllerRateLimit;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new PidControllerRateLimit();
    });


    test('when initialize should create expected components', () => {
        const scheduler = (controller as any).scheduler;

        expect(Executor).toHaveBeenCalledTimes(1);
        expect(Statistics).toHaveBeenCalledTimes(1);
        expect(PriorityQueue).toHaveBeenCalledTimes(1);
        expect(Scheduler).toHaveBeenCalledTimes(1);
        expect(PidController).toHaveBeenCalledTimes(1);
        expect(Rejector).toHaveBeenCalledTimes(1);
        expect(scheduler.start).toHaveBeenCalledTimes(1);
        expect(LatencyController).toHaveBeenCalledTimes(1);
        expect(AutoTuner).toHaveBeenCalledTimes(1);
        expect(ConcurrencyController).toHaveBeenCalledTimes(1);
        expect(Heap).toHaveBeenCalledTimes(1);
        expect(RequestPriorityComparator.compare).toHaveBeenCalledTimes(1);
    });

    test('when run should call expected functions', () => {
        task = jest.fn();
        const priority: number = 3;
        controller.run(task, priority);

        const rejector = (controller as any).rejector;
        const statistics = (controller as any).statistics;

        expect(Request).toHaveBeenCalledWith(task, expect.any(Priority));
        expect(Priority).toHaveBeenCalledWith(priority);
        expect(rejector.process).toHaveBeenCalledWith(expect.any(Request));
        expect(statistics.add).toHaveBeenCalledWith(expect.any(Request));
    });

    test('when shutdown should call expected functions', () => {
        const scheduler = (controller as any).scheduler;

        controller.shutdown();

        expect(scheduler.terminate).toHaveBeenCalledTimes(1);
    });
});
