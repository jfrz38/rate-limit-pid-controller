import { PidControllerRateLimit, RejectedRequestException } from "@jfrz38/pid-controller-core";
import { EventEmitter } from 'events';
import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest';
import { PidControllerMiddleware } from '../../src/middleware/pid-controller.middleware';

// TODO: In iss-22 this logic test will be transferred into common library
vi.mock("@jfrz38/pid-controller-core", () => {
    const MockedController = vi.fn();
    MockedController.prototype.run = vi.fn(async (task) => {
        return await task();
    });

    return {
        PidControllerRateLimit: MockedController,
        RejectedRequestException: class RejectedRequestException extends Error {
            constructor() {
                super('Rejected');
                this.name = 'RejectedRequestException';
            }
        }
    };
});

describe('PidControllerMiddleware', () => {
    let middleware: PidControllerMiddleware;
    let mockController: PidControllerRateLimit;
    let mockRequest: Partial<Request>;
    let mockResponse: any;
    let nextFunction: Mock<NextFunction>;
    let mockOptions: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockController = new PidControllerRateLimit({} as any);

        mockRequest = { headers: {} };
        mockResponse = new EventEmitter() as unknown as EventEmitter & Response;
        mockResponse.removeListener = vi.fn().mockImplementation(mockResponse.removeListener);
        mockResponse.once = vi.fn().mockImplementation(mockResponse.once);

        nextFunction = vi.fn();
        mockOptions = { getPriority: undefined };

        middleware = new PidControllerMiddleware(mockController, mockOptions);
    });

    describe('request lifecycle', () => {
        test('when controller allows request should call next() successfully', async () => {
            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledTimes(1);
            expect(nextFunction).toHaveBeenCalledWith();
        });

        test('when response finishes should remove all event listeners', async () => {
            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockResponse.listenerCount('finish')).toBe(0);
            expect(mockResponse.listenerCount('close')).toBe(0);
            expect(mockResponse.listenerCount('error')).toBe(0);
        });

        test('when next() throws an error should propagate it to the controller catch block', async () => {
            const error = new Error('Route crash');

            nextFunction.mockImplementationOnce(() => {
                throw error;
            }).mockImplementationOnce(() => { });

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledWith(error);
        });
    });

    describe('priority handling', () => {
        test('when getPriority option is provided should pass the extracted value to the controller', async () => {
            const priorityValue = 10;
            mockOptions.getPriority = (req: Request) => Number(req.headers['x-priority']);
            mockRequest.headers = { 'x-priority': '10' };

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockController.run).toHaveBeenCalledWith(expect.any(Function), priorityValue);
        });

        test('when getPriority returns NaN should pass undefined to the controller', async () => {
            mockOptions.getPriority = () => 'not-a-number';

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockController.run).toHaveBeenCalledWith(expect.any(Function), undefined);
        });
    });

    describe('error handling', () => {
        test('when controller rejects the request should call next with RejectedRequestException', async () => {
            const rejectError = new RejectedRequestException(0, 0);
            vi.mocked(mockController.run).mockRejectedValueOnce(rejectError);

            await middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledWith(rejectError);
        });
    });

    describe('concurrency control', () => {
        test('when request is pending should not resolve controller slot until finish event', async () => {
            let taskFinished = false;
            vi.mocked(mockController.run).mockImplementationOnce(async (task: Function, priority?: number) => {
                await task();
                taskFinished = true;
            });

            const middlewarePromise = middleware.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect(taskFinished).toBe(false);

            mockResponse.emit('finish');
            await middlewarePromise;

            expect(taskFinished).toBe(true);
        });
    });
});
