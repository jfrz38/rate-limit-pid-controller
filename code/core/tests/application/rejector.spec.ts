import { vi, describe, expect, beforeEach, Mocked } from 'vitest';

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

    beforeEach(() => {
        priorityQueue = {
            add: vi.fn(),
            getTimeSinceLastEmpty: vi.fn().mockReturnValue(0),
        } as unknown as Mocked<PriorityQueue>;

        statistics = {
            add: vi.fn(),
            calculateCumulativePriorityDistribution: vi.fn().mockReturnValue(100),
        } as unknown as Mocked<Statistics>;

        pidController = {
            updateThreshold: vi.fn().mockReturnValue(123),
        } as unknown as Mocked<PidController>;

        request = {} as unknown as Mocked<Request>;

        rejector = new Rejector(priorityQueue, statistics, pidController, initialThreshold, initialInterval);
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

    describe('updateThreshold', () => {
        test('should update threshold', () => {
            const newThreshold = 400;

            rejector.updateThreshold(newThreshold);

            const currentThreshold = (rejector as any).threshold;
            expect(currentThreshold).toBeDefined();
            expect(currentThreshold).toBe(newThreshold);
        });
    });

    describe('startThresholdCheck', () => {
        test('should call updateThreshold if overloaded and threshold changes', () => {
            const spyUpdate = vi.spyOn(rejector, 'updateThreshold');
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(20);
            statistics.calculateCumulativePriorityDistribution.mockReturnValue(555);
            pidController.updateThreshold.mockReturnValue(123);

            rejector.startThresholdCheck(1000);

            vi.advanceTimersByTime(1000);

            expect(spyUpdate).toHaveBeenNthCalledWith(1, 555);
        });

        test('should not update if not overloaded', () => {
            const spyUpdate = vi.spyOn(rejector, 'updateThreshold');
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(0);

            rejector.startThresholdCheck(1000);
            vi.advanceTimersByTime(1000);

            expect(spyUpdate).not.toHaveBeenCalled();
        });

        test('should not call updateThreshold if the new calculated threshold is identical to the current one', () => {
            const spyUpdate = vi.spyOn(rejector, 'updateThreshold');
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(20);

            const current = (rejector as any).threshold;
            statistics.calculateCumulativePriorityDistribution.mockReturnValue(current);

            vi.advanceTimersByTime(initialInterval);

            expect(spyUpdate).not.toHaveBeenCalled();
        });

        test('should not reset threshold automatically to initial value when service is no longer overloaded', () => {
            (rejector as any).threshold = 10;

            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(0);

            vi.advanceTimersByTime(initialInterval);

            expect((rejector as any).threshold).not.toBe(initialThreshold);
        });
    });

    describe('private methods', () => {
        test('isServiceOverloaded returns true when queue empty time > MAX', () => {
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(999);
            expect((rejector as any).isServiceOverloaded()).toBe(true);
        });

        test('getPriorityThreshold combines pid + stats', () => {
            pidController.updateThreshold.mockReturnValue(321);
            statistics.calculateCumulativePriorityDistribution.mockReturnValue(777);
            const result = (rejector as any).getPriorityThreshold();
            expect(pidController.updateThreshold).toHaveBeenCalledTimes(1);
            expect(statistics.calculateCumulativePriorityDistribution).toHaveBeenNthCalledWith(1, 321);
            expect(result).toBe(777);
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

