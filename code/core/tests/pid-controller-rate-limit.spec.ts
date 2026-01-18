import { vi, describe, expect, beforeEach, Mock } from 'vitest';

import { AutoTuner } from "../src/application/auto-tuner/auto-tuner";
import { ConcurrencyController } from "../src/application/auto-tuner/concurrency.controller";
import { LatencyController } from "../src/application/auto-tuner/latency.controller";
import { Executor } from "../src/application/executor";
import { PidController } from "../src/application/pid-controller";
import { Rejector } from "../src/application/rejector";
import { Scheduler } from "../src/application/scheduler";
import { ShutdownManager } from "../src/core/shutdown/shutdown-manager";
import { Priority } from "../src/domain/priority";
import { RequestPriorityComparator } from "../src/domain/priority-queue/comparator";
import { Heap } from "../src/domain/priority-queue/heap";
import { PriorityQueue } from "../src/domain/priority-queue/priority-queue";
import { TimeoutHandler } from "../src/domain/priority-queue/timeout-handler";
import { Request } from "../src/domain/request";
import { Statistics } from "../src/domain/statistics/statistics";
import { PidControllerRateLimit } from "../src/pid-controller-rate-limit";
import { ControllerHistory } from "../src/application/auto-tuner/controller-history";

vi.mock("../src/domain/statistics/statistics");
vi.mock("../src/domain/priority-queue/priority-queue");
vi.mock("../src/application/scheduler");
vi.mock("../src/application/pid-controller");
vi.mock("../src/application/rejector");
vi.mock("../src/application/auto-tuner/auto-tuner");
vi.mock("../src/application/auto-tuner/concurrency.controller");
vi.mock("../src/application/auto-tuner/latency.controller");
vi.mock("../src/domain/request");
vi.mock("../src/domain/priority");
vi.mock('../src/application/executor', () => {
    return {
        Executor: vi.fn()
    };
});
vi.mock("../src/domain/request");
vi.mock("../src/domain/priority-queue/heap");
vi.mock("../src/domain/priority-queue/comparator");
vi.mock("../src/core/shutdown/shutdown-manager");
vi.mock("../src/core/shutdown/interval-manager");
vi.mock("../src/domain/priority-queue/timeout-handler");
vi.mock("../src/application/auto-tuner/controller-history");

describe('PidControllerRateLimit (mocked)', () => {
    let task: Mock;

    let controller: PidControllerRateLimit;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
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
        expect(ShutdownManager).toHaveBeenCalledTimes(1);
        expect(TimeoutHandler).toHaveBeenCalledTimes(1);
        expect(ControllerHistory).toHaveBeenCalledTimes(1);
    });

    test('when run should call expected functions', () => {
        task = vi.fn();
        const priority: number = 3;
        controller.run(task, priority);

        const rejector = (controller as any).rejector;

        expect(Request).toHaveBeenCalledWith(task, expect.any(Priority));
        expect(Priority).toHaveBeenCalledWith(priority);
        expect(rejector.process).toHaveBeenCalledWith(expect.any(Request));
    });

    test('when shutdown should call expected functions', () => {
        const shutdownManager = (controller as any).shutdownManager;

        controller.shutdown();

        expect(shutdownManager.shutdown).toHaveBeenCalledTimes(1);
    });
});
