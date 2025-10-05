import { PidController } from "../../src/application/pid-controller";
import { Rejector } from "../../src/application/rejector";
import { Statistics } from "../../src/application/statistics";
import { Event } from "../../src/domain/events";
import { RejectedRequestException } from "../../src/domain/exceptions/rejected-request.exception";
import { Priority } from "../../src/domain/priority";
import { PriorityQueue } from "../../src/domain/priority-queue/priority-queue";
import { Request } from "../../src/domain/request";

jest.useFakeTimers();

describe('Rejector', () => {
    let priorityQueue: jest.Mocked<PriorityQueue>;
    let statistics: jest.Mocked<Statistics>;
    let pidController: jest.Mocked<PidController>;
    let request: jest.Mocked<Request>;
    let rejector: Rejector;

    beforeEach(() => {
        priorityQueue = {
            add: jest.fn(),
            getTimeSinceLastEmpty: jest.fn().mockReturnValue(0),
        } as unknown as jest.Mocked<PriorityQueue>;

        statistics = {
            add: jest.fn(),
            calculateCumulativePriorityDistribution: jest.fn().mockReturnValue(100),
        } as unknown as jest.Mocked<Statistics>;

        pidController = {
            updateThreshold: jest.fn().mockReturnValue(123),
        } as unknown as jest.Mocked<PidController>;

        request = {} as unknown as jest.Mocked<Request>;

        // Silence console.info
        jest.spyOn(console, 'info').mockImplementation(() => { });

        rejector = new Rejector(priorityQueue, statistics, pidController);
    });

    describe('process', () => {
        test('when request priority is lower than threshold should add request to statistics', () => {
            request = {
                priority: 10
            } as unknown as jest.Mocked<Request>;

            setThreshold(500);

            rejector.process(request);

            expect(statistics.add).toHaveBeenNthCalledWith(1, request);
            expect(priorityQueue.add).toHaveBeenNthCalledWith(1, request);
            expect((request as any).status).toBe(Event.QUEUED);

        });

        test('when request priority is higher than threshold should reject request and throw exception', () => {
            request = {
                priority: 999
            } as unknown as jest.Mocked<Request>;

            setThreshold(1);

            expect(() => rejector.process(request)).toThrow(RejectedRequestException);
            expect(statistics.add).toHaveBeenNthCalledWith(1, request);
            expect(priorityQueue.add).not.toHaveBeenCalled();
            expect((request as any).status).toBe(Event.REJECTED);
        });
    });

    describe('updateThreshold', () => {
        test('should update threshold and log info', () => {
            const spy = jest.spyOn(console, 'info').mockImplementation();
            rejector.updateThreshold(500);
            expect(spy).toHaveBeenNthCalledWith(1, 'Threshold modified from 768 to: 500');
            spy.mockRestore();
        });

        test('should mark decrease correctly', () => {
            (rejector as any).threshold = 100;
            rejector.updateThreshold(50);
            // TODO: decrease flow
        });
    });

    describe('startThresholdCheck', () => {
        test('should call updateThreshold if overloaded and threshold changes', () => {
            const spyUpdate = jest.spyOn(rejector, 'updateThreshold');
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(20);
            statistics.calculateCumulativePriorityDistribution.mockReturnValue(555);
            pidController.updateThreshold.mockReturnValue(123);

            rejector.startThresholdCheck(1000);

            jest.advanceTimersByTime(1000);

            expect(spyUpdate).toHaveBeenNthCalledWith(1, 555);
        });

        test('should not update if not overloaded', () => {
            const spyUpdate = jest.spyOn(rejector, 'updateThreshold');
            priorityQueue.getTimeSinceLastEmpty.mockReturnValue(0);

            rejector.startThresholdCheck(1000);
            jest.advanceTimersByTime(1000);

            expect(spyUpdate).not.toHaveBeenCalled();
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

    function setThreshold(threshold: number) {
        (rejector as any).threshold = new Priority(threshold, 0).value;
    }
});

