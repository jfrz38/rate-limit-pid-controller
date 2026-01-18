import { pidControllerErrorHandler } from '../src/error';
import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { Request, Response, NextFunction } from 'express';

describe('pidControllerErrorHandler', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction = vi.fn();

    beforeEach(() => {
        mockRequest = {};
        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            headersSent: false,
        };
        vi.clearAllMocks();
    });

    test('should call next(error) if the error is not a RejectedRequestException', () => {
        const handler = pidControllerErrorHandler();
        const genericError = new Error('Generic Error');

        handler(genericError, mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledWith(genericError);
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should call next(error) if headers have already been sent', () => {
        const handler = pidControllerErrorHandler();
        const error = new RejectedRequestException(0, 0);
        mockResponse.headersSent = true;

        handler(error, mockRequest as Request, mockResponse as Response, nextFunction);

        expect(nextFunction).toHaveBeenCalledWith(error);
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should return 429 with the default message when no options are provided', () => {
        const handler = pidControllerErrorHandler();
        const error = new RejectedRequestException(0, 0);

        handler(error, mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockResponse.status).toHaveBeenCalledWith(429);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.'
        });
    });

    test('should use the custom message provided in options', () => {
        const customMessage = 'Custom limit message';
        const handler = pidControllerErrorHandler({ message: customMessage });
        const error = new RejectedRequestException(0, 0);

        handler(error, mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: customMessage })
        );
    });

    test('should set Retry-After header if provided in options', () => {
        const retryAfter = 60;
        const handler = pidControllerErrorHandler({ retryAfter });
        const error = new RejectedRequestException(0, 0);

        handler(error, mockRequest as Request, mockResponse as Response, nextFunction);

        expect(mockResponse.set).toHaveBeenCalledWith('Retry-After', '60');
        expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
});
