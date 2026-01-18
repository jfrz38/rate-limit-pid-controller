import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pidControllerMiddleware } from '../src/middleware'; // ajusta la ruta
import { PidControllerRateLimit, RejectedRequestException } from "@jfrz38/pid-controller-core";
import { Request, Response, NextFunction } from 'express';

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
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;

    beforeEach(() => {
        mockRequest = {
            headers: {}
        };
        mockResponse = {};
        nextFunction = vi.fn();
        vi.clearAllMocks();
    });

    test('should call next() successfully when controller allows the request', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        
        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledTimes(1);
        expect(nextFunction).toHaveBeenCalledWith();
    });

    test('should pass the correct priority extracted from headers', async () => {
        const priority = 5;
        const priorityFn = (req: Request) => Number(req.headers['x-priority']);
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });
        
        mockRequest.headers = { 'x-priority': `${priority}` };

        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;
        
        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), priority);
    });

    test('should use undefined priority if the header is missing or NaN', async () => {
        const priorityFn = (req: Request) => Number(req.headers['x-priority']);
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });
        
        mockRequest.headers = { 'x-priority': 'not-a-number' };
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;
        
        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
    });

    test('should handle errors in the priority function gracefully', async () => {
        const priorityFn = () => { throw new Error('Crash'); };
        const { middleware } = pidControllerMiddleware({ priority: priorityFn });
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;

        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(controllerInstance.run).toHaveBeenCalledWith(expect.any(Function), undefined);
        expect(nextFunction).toHaveBeenCalled();
    });

    test('should call next(error) if the controller rejects the request', async () => {
        const { middleware } = pidControllerMiddleware(undefined);
        const controllerInstance = vi.mocked(PidControllerRateLimit).mock.results[0].value;
        
        const rejectError = new RejectedRequestException(0,0);
        controllerInstance.run.mockRejectedValueOnce(rejectError);

        await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledWith(rejectError);
    });
});
