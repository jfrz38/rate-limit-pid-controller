import { PidControllerRateLimit } from "@jfrz38/pid-controller-core";
import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { pidControllerMiddleware } from "../src/middleware";

vi.mock("@jfrz38/pid-controller-core");
vi.mock("@jfrz38/pid-controller-shared");

describe('Express PID Controller Middleware', () => {
    let mockRequest: any;
    let mockResponse: any;
    let nextFunction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequest = {};
        mockResponse = {};
        nextFunction = vi.fn();
    });

    test('should create a middleware that calls handler.use', async () => {
        const options = {
            pidConfig: { KP: 1, KI: 0.1 } as any,
            priority: { getPriority: (req: any) => 1 }
        };

        const { middleware } = pidControllerMiddleware(options);

        await middleware(mockRequest, mockResponse, nextFunction);

        expect(PidControllerRateLimit).toHaveBeenCalledWith(options.pidConfig);

        const mockControllerInstance = vi.mocked(PidControllerRateLimit).mock.instances[0];
        expect(PidControllerMiddlewareHandler).toHaveBeenCalledWith(
            mockControllerInstance,
            options.priority
        );

        const mockHandlerInstance = vi.mocked(PidControllerMiddlewareHandler).mock.instances[0];
        expect(mockHandlerInstance.use).toHaveBeenCalledWith(
            mockRequest,
            mockResponse,
            nextFunction
        );
    });

    test('should work with undefined options', async () => {
        const { middleware } = pidControllerMiddleware();

        await middleware(mockRequest, mockResponse, nextFunction);

        expect(PidControllerRateLimit).toHaveBeenCalledWith(undefined);
        expect(PidControllerMiddlewareHandler).toHaveBeenCalled();

        const mockHandlerInstance = vi.mocked(PidControllerMiddlewareHandler).mock.instances[0];
        expect(mockHandlerInstance.use).toBeCalled();
    });
});
