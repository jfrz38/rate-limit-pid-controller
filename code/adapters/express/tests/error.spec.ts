import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { HttpErrorResponse } from "@jfrz38/pid-controller-shared";
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { pidControllerErrorHandler } from '../src/error';

const mockFormat = vi.fn();

vi.mock("@jfrz38/pid-controller-shared", () => {
    return {
        HttpErrorResponse: vi.fn().mockImplementation(function (this: any) {
            this.format = mockFormat;
            return this;
        })
    };
});

describe('Express PID Controller Error handler', () => {
    let mockRequest: any;
    let mockResponse: any;
    let nextFunction: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRequest = {};
        mockResponse = { headersSent: false };
        nextFunction = vi.fn();
    });

    test('when is RejectedRequestException should call shared', () => {
        const options = { code: 429 };
        const handler = pidControllerErrorHandler(options);
        const error = new RejectedRequestException(10, 5);

        handler(error, mockRequest, mockResponse, nextFunction);

        expect(HttpErrorResponse).toHaveBeenCalledWith(error, options);

        expect(mockFormat).toHaveBeenCalledWith(mockResponse);
    });

    test('when is not a RejectedRequestException should call next(error) and not call shared', () => {
        const handler = pidControllerErrorHandler();
        const genericError = new Error('Other error');

        handler(genericError, mockRequest, mockResponse, nextFunction);

        expect(HttpErrorResponse).not.toHaveBeenCalled();
        expect(nextFunction).toHaveBeenCalledWith(genericError);
    });

    test('when headers are sent should should call next(error)', () => {
        const handler = pidControllerErrorHandler();
        const error = new RejectedRequestException(0, 0);
        mockResponse.headersSent = true;

        handler(error, mockRequest, mockResponse, nextFunction);

        expect(HttpErrorResponse).not.toHaveBeenCalled();
        expect(nextFunction).toHaveBeenCalledWith(error);
    });
});
