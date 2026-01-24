import { PidControllerRateLimit, RejectedRequestException } from "@jfrz38/pid-controller-core";
import { EventEmitter } from 'events';
import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest';
import { PidControllerMiddlewareHandler } from "../../src/middleware/pid-controller-middleware-handler";

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

describe('PidControllerMiddlewareHandler', () => {
    let handler: PidControllerMiddlewareHandler;
    let mockController: PidControllerRateLimit;
    let mockRequest: Partial<Request>;
    let mockResponse: any;
    let nextFunction: Mock<NextFunction>;
    let mockPriorityOptions: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockController = new PidControllerRateLimit({} as any);

        mockRequest = { headers: {} };
        mockResponse = new EventEmitter() as unknown as EventEmitter & Response;
        mockResponse.removeListener = vi.fn().mockImplementation(mockResponse.removeListener);
        mockResponse.once = vi.fn().mockImplementation(mockResponse.once);

        nextFunction = vi.fn();
        mockPriorityOptions = { getPriority: undefined };

        handler = new PidControllerMiddlewareHandler(mockController, mockPriorityOptions);
    });

    describe('request lifecycle', () => {
        test('when controller allows request should call next() successfully', async () => {
            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledTimes(1);
            expect(mockResponse.listenerCount('finish')).toBe(0);
        });

        test('when response finishes should remove all event listeners', async () => {
            nextFunction.mockImplementation(() => {
                mockResponse.emit('close');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockResponse.listenerCount('finish')).toBe(0);
            expect(mockResponse.listenerCount('close')).toBe(0);
            expect(mockResponse.listenerCount('error')).toBe(0);
        });

        test('response listeners are removed after finish', async () => {

            nextFunction.mockImplementation(() => {
                expect(mockResponse.listenerCount('finish')).toBe(1);
                expect(mockResponse.listenerCount('close')).toBe(1);

                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockResponse.listenerCount('finish')).toBe(0);
            expect(mockResponse.listenerCount('close')).toBe(0);
            expect(mockResponse.listenerCount('error')).toBe(0);
        });

        test('next is called only once on success', async () => {

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledTimes(1);
        });

        test('does not resolve PID slot until response ends', async () => {
            const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

            let taskFinished = false;
            controllerInstance.run.mockImplementationOnce(async (task: () => Promise<void>) => {
                await task();
                taskFinished = true;
            });

            const executedMiddleware = handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect(taskFinished).toBe(false);

            mockResponse.emit('finish');

            await executedMiddleware;

            expect(taskFinished).toBe(true);
        });

        test('should resolve the promise when client closes the connection early (close event)', async () => {

            nextFunction.mockImplementation(() => {
                mockResponse.emit('close');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
        });
    });

    describe('priority handling', () => {
        test('when getPriority option is provided should pass the extracted value to the controller', async () => {
            const priorityValue = 5;
            mockPriorityOptions.getPriority = (req: Request) => req.headers['x-priority'];
            mockRequest.headers = { 'x-priority': String(priorityValue) };

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockController.run).toHaveBeenCalledWith(expect.any(Function), priorityValue);
        });

        test('when getPriority option is not provided should pass the undefined value to the controller', async () => {
            const priorityFn = (req: Request) => Number(req.headers['x-priority']);

            mockRequest.headers = { 'x-priority': 'not-a-number' };
            const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
        });

        test('when getPriority returns NaN should pass undefined to the controller', async () => {
            mockPriorityOptions.getPriority = () => "prioridad-invalida";

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(mockController.run).toHaveBeenCalledWith(expect.any(Function), undefined);
        });

        test('when getPriority throws error should pass undefined to the controller', async () => {
            const priorityFn = () => { throw new Error('Crash'); };
            mockPriorityOptions.getPriority = () => { throw new Error('Crash'); };

            const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

            nextFunction.mockImplementation(() => {
                mockResponse.emit('finish');
            });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
            expect(nextFunction).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        test('when controller rejects the request should call next with RejectedRequestException', async () => {
            const rejectError = new RejectedRequestException(0, 0);
            vi.mocked(mockController.run).mockRejectedValueOnce(rejectError);

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledWith(rejectError);
        });

        test('when next() throws an error should propagate it to the controller catch block', async () => {
            const error = new Error('Route crash');

            nextFunction.mockImplementationOnce(() => {
                throw error;
            }).mockImplementationOnce(() => { });

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledWith(error);
        });

        test('when controller rejects immediately task is not executed', async () => {
            const controller = vi.mocked(PidControllerRateLimit).mock.results[0].value;

            controller.run.mockRejectedValueOnce(new Error('Rejected'));

            await handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('concurrency sync', () => {
        test('when request is pending should not resolve controller slot until finish event', async () => {
            let controllerResolved = false;

            vi.mocked(mockController.run).mockImplementationOnce(async (task: Function) => {
                await task();
                controllerResolved = true;
            });

            const middlewarePromise = handler.use(
                mockRequest as Request,
                mockResponse as Response,
                nextFunction as unknown as NextFunction
            );

            expect(nextFunction).toHaveBeenCalled();
            expect(controllerResolved).toBe(false);

            mockResponse.emit('finish');
            await middlewarePromise;

            expect(controllerResolved).toBe(true);
        });
    });
});
