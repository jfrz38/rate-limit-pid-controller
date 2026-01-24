import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpErrorResponse } from "../../src/filter/http-error-response";

describe('HttpErrorResponse', () => {
    let mockExpressResponse: any;
    const mockException = new RejectedRequestException(10, 50);
    const DEFAULT_ERROR_TITLE = 'RATE_LIMIT_EXCEEDED';
    const DEFAULT_ERROR_MESSAGE = 'Too many requests, please try again later.';

    beforeEach(() => {
        mockExpressResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        };
    });

    describe('error message visibility and custom body', () => {
        test.each([
            { hideError: true, customResponse: undefined, expectedMessage: DEFAULT_ERROR_MESSAGE },
            { hideError: false, customResponse: undefined, expectedMessage: mockException.message },
            { hideError: undefined, customResponse: undefined, expectedMessage: DEFAULT_ERROR_MESSAGE },
            { hideError: true, customResponse: { message: 'Custom Block' }, expectedMessage: 'Custom Block' },
            { hideError: false, customResponse: { message: 'Custom Block' }, expectedMessage: mockException.message },
        ])('when hideError is $hideError, should result in message: $expectedMessage', ({ hideError, customResponse, expectedMessage }) => {
            const responseError = {
                hideError,
                response: customResponse,
                title: DEFAULT_ERROR_TITLE,
                message: DEFAULT_ERROR_MESSAGE
            };

            const httpErrorResponse = new HttpErrorResponse(mockException, responseError as any);
            httpErrorResponse.format(mockExpressResponse);

            const sentBody = mockExpressResponse.json.mock.calls[0][0];
            expect(sentBody.message).toBe(expectedMessage);
        });
    });

    describe('headers and status codes', () => {
        test('should include Retry-After header if provided in responseError', () => {
            const responseError = { retryAfter: 60 };
            const httpErrorResponse = new HttpErrorResponse(mockException, responseError as any);

            httpErrorResponse.format(mockExpressResponse);

            expect(mockExpressResponse.set).toHaveBeenCalledWith('Retry-After', '60');
        });

        test('should use default status code 429 if none provided', () => {
            const httpErrorResponse = new HttpErrorResponse(mockException, undefined);

            httpErrorResponse.format(mockExpressResponse);

            expect(mockExpressResponse.status).toHaveBeenCalledWith(429);
        });

        test('should use custom status code if provided', () => {
            const responseError = { code: 503 };
            const httpErrorResponse = new HttpErrorResponse(mockException, responseError as any);

            httpErrorResponse.format(mockExpressResponse);

            expect(mockExpressResponse.status).toHaveBeenCalledWith(503);
        });
    });

    describe('inheritance and structure', () => {
        test('should use DEFAULT_RESPONSE_BODY when no custom response is provided', () => {
            const responseError = { title: 'REJECTED', message: 'Wait' };
            const httpErrorResponse = new HttpErrorResponse(mockException, responseError as any);

            httpErrorResponse.format(mockExpressResponse);

            const sentBody = mockExpressResponse.json.mock.calls[0][0];
            expect(sentBody).toHaveProperty('error');
            expect(sentBody).toHaveProperty('message');
        });

        test('should not modify custom response body if hidePidMessage is true', () => {
            const customBody = { custom_err: 'foo', message: 'do not touch' };
            const responseError = { 
                response: customBody,
                hideError: true 
            };

            const httpErrorResponse = new HttpErrorResponse(mockException, responseError as any);
            httpErrorResponse.format(mockExpressResponse);

            const sentBody = mockExpressResponse.json.mock.calls[0][0];
            expect(sentBody.message).toBe('do not touch');
            expect(sentBody.custom_err).toBe('foo');
        });
    });
});
