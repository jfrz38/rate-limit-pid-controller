import { beforeEach, describe, expect, Mocked, vi } from 'vitest';

import { PidController } from "../../src/application/pid-controller";
import { Rejector } from "../../src/application/rejector";
import { DefaultOptions } from "../../src/default-parameters";
import { Event } from "../../src/domain/events";
import { RejectedRequestException } from "../../src/domain/exceptions/rejected-request.exception";
import { Priority } from "../../src/domain/priority";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";
import { Request } from "../../src/domain/request";
import { Statistics } from "../../src/domain/statistics/statistics";

vi.useFakeTimers();
vi.mock("../../src/core/shutdown/interval-manager");
vi.mock("../../src/core/logging/logger", () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn()
    }),
}));

describe('Rejector', () => {
    let priorityQueue: Mocked<PriorityQueue>;
    let statistics: Mocked<Statistics>;
    let pidController: Mocked<PidController>;
    let request: Mocked<Request>;
    let rejector: Rejector;

    const initialThreshold = DefaultOptions.values.threshold.initial;
    const initialInterval = DefaultOptions.values.pid.interval;

    const INITIAL_THRESHOLD = 1000;
    const PID_INTERVAL = 1000;

    beforeEach(() => {
        vi.clearAllMocks();

        priorityQueue = {
            add: vi.fn(),
            getSecondsSinceLastEmpty: vi.fn().mockReturnValue(0),
        } as unknown as Mocked<PriorityQueue>;

        statistics = {
            add: vi.fn(),
            calculateCumulativePriorityDistribution: vi.fn(),
        } as unknown as Mocked<Statistics>;

        pidController = {
            updateThreshold: vi.fn().mockReturnValue(100)
        } as unknown as Mocked<PidController>;

        rejector = new Rejector(
            priorityQueue,
            statistics,
            pidController,
            INITIAL_THRESHOLD,
            PID_INTERVAL
        );
    });

    describe('process', () => {
        test('when request priority is lower than threshold should add request to statistics', () => {
            request = {
                priority: 10
            } as unknown as Mocked<Request>;

            setThreshold(500);

            rejector.process(request);

            expect(statistics.add).toHaveBeenNthCalledWith(1, request);
            expect(priorityQueue.add).toHaveBeenNthCalledWith(1, request);
            expect((request as any).status).toBe(Event.QUEUED);

        });

        test('when request priority is higher than threshold should reject request and throw exception', () => {
            request = {
                priority: 999
            } as unknown as Mocked<Request>;

            setThreshold(1);

            expect(() => rejector.process(request)).toThrow(RejectedRequestException);
            expect(statistics.add).toHaveBeenNthCalledWith(1, request);
            expect(priorityQueue.add).not.toHaveBeenCalled();
            expect((request as any).status).toBe(Event.REJECTED);
        });

        test('when priority is exactly equal to threshold should accept request', () => {
            const exactValue = 100;
            (rejector as any).threshold = exactValue;
            const request = { priority: exactValue, status: undefined } as any;

            expect(() => rejector.process(request)).not.toThrow();
            expect(request.status).toBe(Event.QUEUED);
        });
    });

    describe('Threshold Updates (Interval Logic)', () => {
        test('should update threshold', () => {
            const newThreshold = 400;

            rejector.updateThreshold(newThreshold);

            const currentThreshold = (rejector as any).threshold;
            expect(currentThreshold).toBeDefined();
            expect(currentThreshold).toBe(newThreshold);
        });

        test('when overloaded should use percentile distribution from statistics', () => {
            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(15);
            pidController.updateThreshold.mockReturnValue(50);
            statistics.calculateCumulativePriorityDistribution.mockReturnValue(400);

            vi.advanceTimersByTime(PID_INTERVAL);

            expect(statistics.calculateCumulativePriorityDistribution).toHaveBeenCalledWith(50);
            expect((rejector as any).threshold).toBe(400);
        });

        test('when not overloaded should use lineal recovery based on INITIAL_THRESHOLD', () => {
            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(0);
            pidController.updateThreshold.mockReturnValue(80);

            vi.advanceTimersByTime(PID_INTERVAL);

            expect((rejector as any).threshold).toBe(800);
            expect(statistics.calculateCumulativePriorityDistribution).not.toHaveBeenCalled();
        });

        test('when percentile calculation fails should use lineal recovery', () => {
            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(15);
            pidController.updateThreshold.mockReturnValue(50);
            statistics.calculateCumulativePriorityDistribution.mockImplementation(() => {
                throw new Error("Stats failed");
            });

            vi.advanceTimersByTime(PID_INTERVAL);

            expect((rejector as any).threshold).toBe(500);
        });

        test('should not log or update if threshold has not changed', () => {
            const spyUpdate = vi.spyOn(rejector, 'updateThreshold');

            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(0);
            pidController.updateThreshold.mockReturnValue(100);

            vi.advanceTimersByTime(PID_INTERVAL);

            expect(spyUpdate).toHaveBeenCalled();
            expect((rejector as any).threshold).toBe(INITIAL_THRESHOLD);
        });
    });

    describe('isServiceOverloaded', () => {
        test('when time exceed should return true', () => {
            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(11);
            expect((rejector as any).isServiceOverloaded()).toBe(true);
        });

        test('when time is not exceed should return false', () => {
            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(5);
            expect((rejector as any).isServiceOverloaded()).toBe(false);
        });

        test('when other MAX_QUEUE_EMPTY_TIME should return expected result', () => {
            const newMaxTime = 100;
            (rejector as any).MAX_QUEUE_EMPTY_TIME = newMaxTime;

            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(newMaxTime - 1);
            expect((rejector as any).isServiceOverloaded()).toBe(false);


            priorityQueue.getSecondsSinceLastEmpty.mockReturnValue(newMaxTime + 1);
            expect((rejector as any).isServiceOverloaded()).toBe(true);
        });
    });

    describe('Lifecycle', () => {
        test('should register the interval in the intervalManager upon initialization', async () => {
            const { intervalManager } = await import("../../src/core/shutdown/interval-manager");

            expect(intervalManager.add).toHaveBeenCalled();
        });
    });

    function setThreshold(threshold: number) {
        (rejector as any).threshold = new Priority(threshold, 0).value;
    }
});

