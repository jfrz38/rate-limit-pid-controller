import { PidController } from "../../src/application/pid-controller";
import { Rejector } from "../../src/application/rejector";
import { Statistics } from "../../src/application/statistics";
import { Event } from "../../src/domain/events";
import { RejectedRequestException } from "../../src/domain/exceptions/rejected-request.exception";
import { Priority } from "../../src/domain/priority";
import { PriorityQueue } from "../../src/domain/priority-queue";
import { Request } from "../../src/domain/request";

jest.useFakeTimers();

describe('Rejector', () => {
    let priorityQueueMock: jest.Mocked<PriorityQueue>;
    let statisticsMock: jest.Mocked<Statistics>;
    let pidControllerMock: jest.Mocked<PidController>;
    let rejector: Rejector;

    beforeEach(() => {
        priorityQueueMock = {
            addRequest: jest.fn(),
            getTimeSinceLastEmpty: jest.fn().mockReturnValue(0),
        } as unknown as jest.Mocked<PriorityQueue>;

        statisticsMock = {
            add: jest.fn(),
            calculateCumulativePriorityDistribution: jest.fn().mockReturnValue(100),
        } as unknown as jest.Mocked<Statistics>;

        pidControllerMock = {
            updateThreshold: jest.fn().mockReturnValue(123),
        } as unknown as jest.Mocked<PidController>;

        rejector = new Rejector(priorityQueueMock, statisticsMock, pidControllerMock);
    });

    describe('process', () => {
        test('when request priority is lower than threshold should add request to statistics', () => {
            const request = createPriorityRequest(1);

            setThreshold(100);

            rejector.process(request);

            expect(statisticsMock.add).toHaveBeenNthCalledWith(1, request);
            expect(priorityQueueMock.add).toHaveBeenNthCalledWith(1, request);
            expect(getStatus(request)).toBe(Event.QUEUED);

        });

        test('when request priority is higher than threshold should reject request and throw exception', () => {
            const request = createPriorityRequest(999);

            setThreshold(500);

            expect(() => rejector.process(request)).toThrow(RejectedRequestException);
            expect(getStatus(request)).toBe(Event.REJECTED);
            expect(priorityQueueMock.add).not.toHaveBeenCalled();
        });

        function createPriorityRequest(priority: number): Request {
            return new Request(() => null, new Priority(priority, 0));
        }

        function getStatus(request: Request) {
            return (request as any)._status
        }
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
            priorityQueueMock.getTimeSinceLastEmpty.mockReturnValue(20);
            statisticsMock.calculateCumulativePriorityDistribution.mockReturnValue(555);
            pidControllerMock.updateThreshold.mockReturnValue(123);

            rejector.startThresholdCheck(1000);

            jest.advanceTimersByTime(1000);

            expect(spyUpdate).toHaveBeenNthCalledWith(1, 555);
        });

        test('should not update if not overloaded', () => {
            const spyUpdate = jest.spyOn(rejector, 'updateThreshold');
            priorityQueueMock.getTimeSinceLastEmpty.mockReturnValue(0);

            rejector.startThresholdCheck(1000);
            jest.advanceTimersByTime(1000);

            expect(spyUpdate).not.toHaveBeenCalled();
        });
    });

    describe('private methods', () => {
        test('isServiceOverloaded returns true when queue empty time > MAX', () => {
            priorityQueueMock.getTimeSinceLastEmpty.mockReturnValue(999);
            expect((rejector as any).isServiceOverloaded()).toBe(true);
        });

        test('getPriorityThreshold combines pid + stats', () => {
            pidControllerMock.updateThreshold.mockReturnValue(321);
            statisticsMock.calculateCumulativePriorityDistribution.mockReturnValue(777);
            const result = (rejector as any).getPriorityThreshold();
            expect(pidControllerMock.updateThreshold).toHaveBeenCalledTimes(1);
            expect(statisticsMock.calculateCumulativePriorityDistribution).toHaveBeenNthCalledWith(1, 321);
            expect(result).toBe(777);
        });
    });

    function setThreshold(threshold: number) {
        (rejector as any).threshold = new Priority(threshold, 0).value;
    }
});

