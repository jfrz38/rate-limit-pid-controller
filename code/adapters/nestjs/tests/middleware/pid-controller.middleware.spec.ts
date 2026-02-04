import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PidControllerMiddleware } from '../../src/middleware/pid-controller.middleware';

describe('NestJS PID Controller Middleware', () => {
    let middleware: PidControllerMiddleware;
    let mockHandler: PidControllerMiddlewareHandler;
    let mockRequest: any;
    let mockResponse: any;
    let nextFunction: any;

    beforeEach(() => {
        mockHandler = {
            use: vi.fn()
        } as unknown as PidControllerMiddlewareHandler;

        middleware = new PidControllerMiddleware(mockHandler);

        mockRequest = { method: 'GET', url: '/' };
        mockResponse = {};
        nextFunction = vi.fn();
    });

    test('should be defined', () => {
        expect(middleware).toBeDefined();
    });

    test('should delegate the request handling to the shared handler', async () => {
        await middleware.use(mockRequest, mockResponse, nextFunction);

        expect(mockHandler.use).toHaveBeenCalledTimes(1);
        expect(mockHandler.use).toHaveBeenCalledWith(
            mockRequest,
            mockResponse,
            nextFunction
        );
    });

    test('should handle asynchronous execution if handler is async', async () => {
        let resolved = false;
        mockHandler.use = vi.fn().mockImplementation(async () => {
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolved = true;
                    resolve();
                }, 10);
            });
        });

        await middleware.use(mockRequest, mockResponse, nextFunction);

        expect(resolved).toBe(true);
        expect(mockHandler.use).toHaveBeenCalled();
    });
});
