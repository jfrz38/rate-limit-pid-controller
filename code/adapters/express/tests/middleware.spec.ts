import { describe, test, expect, vi, beforeEach, Mock } from 'vitest';
import { pidControllerMiddleware } from '../src/middleware';
import { PidControllerRateLimit, RejectedRequestException } from "@jfrz38/pid-controller-core";
import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

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

describe('pidControllerMiddleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: any;
    let nextFunction: Mock<NextFunction>;

    beforeEach(() => {
        mockRequest = {
            headers: {}
        };
        mockResponse = new EventEmitter() as unknown as EventEmitter & Response;
        nextFunction = vi.fn();
        vi.clearAllMocks();
    });

    test('should call next() successfully when controller allows the request', async () => {
        const { middleware } = pidControllerMiddleware(undefined);

        nextFunction.mockImplementation(() => {
            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(nextFunction).toHaveBeenCalledTimes(1);
        expect(nextFunction).toHaveBeenCalledWith();
    });

    test('should pass the correct priority extracted from headers', async () => {
        const priority = 5;
        const priorityFn = (req: Request) => Number(req.headers['x-priority']);
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });

        mockRequest.headers = { 'x-priority': `${priority}` };

        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        nextFunction.mockImplementation(() => {
            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), priority);
    });

    test('should use undefined priority if the header is missing or NaN', async () => {
        const priorityFn = (req: Request) => Number(req.headers['x-priority']);
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });

        mockRequest.headers = { 'x-priority': 'not-a-number' };
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        nextFunction.mockImplementation(() => {
            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
    });

    test('should handle errors in the priority function gracefully', async () => {
        const priorityFn = () => { throw new Error('Crash'); };
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        nextFunction.mockImplementation(() => {
            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
        expect(nextFunction).toHaveBeenCalled();
    });

    test('should call next(error) if the controller rejects the request', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        const rejectError = new RejectedRequestException(0, 0);
        controllerInstance.run.mockRejectedValueOnce(rejectError);

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );
        expect(nextFunction).toHaveBeenCalledWith(rejectError);
    });

    test('should resolve the promise when client closes the connection early (close event)', async () => {
        const { middleware } = pidControllerMiddleware(undefined);

        nextFunction.mockImplementation(() => {
            mockResponse.emit('close');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(nextFunction).toHaveBeenCalled();
    });

    test('should propagate errors from next() to the catch block', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        const error = new Error('Route crash');

        nextFunction.mockImplementationOnce(() => {
            throw error;
        }).mockImplementationOnce(() => { });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(nextFunction).toHaveBeenCalledWith(error);
    });

    test('does not resolve PID slot until response ends', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        let taskFinished = false;
        controllerInstance.run.mockImplementationOnce(async (task: () => Promise<void>) => {
            await task();
            taskFinished = true;
        });

        const executedMiddleware = middleware(
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



    test('next is called only once on success', async () => {
        const { middleware } = pidControllerMiddleware(undefined);

        nextFunction.mockImplementation(() => {
            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(nextFunction).toHaveBeenCalledTimes(1);
    });

    test('response listeners are removed after finish', async () => {
        const { middleware } = pidControllerMiddleware(undefined);

        nextFunction.mockImplementation(() => {
            expect(mockResponse.listenerCount('finish')).toBe(1);
            expect(mockResponse.listenerCount('close')).toBe(1);

            mockResponse.emit('finish');
        });

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(mockResponse.listenerCount('finish')).toBe(0);
        expect(mockResponse.listenerCount('close')).toBe(0);
        expect(mockResponse.listenerCount('error')).toBe(0);
    });

    test('task is not executed when controller rejects immediately', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        const controller = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        controller.run.mockRejectedValueOnce(new Error('Rejected'));

        await middleware(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction as unknown as NextFunction
        );

        expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });



});
