import { RejectedRequestException } from "@jfrz38/pid-controller-core";
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpResponse } from '../../../../src/filter/response/http/http-response';

describe('HttpResponse', () => {
    let mockResponse: any;
    const defaultErrorMessage = 'Too many requests, please try again later.';
    const customErrorMessage = 'custom';
    const mockException = new RejectedRequestException(0, 0);

    beforeEach(() => {
        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        };
    });

    describe('error message visibility', () => {

        test.each([
            { hideError: false, customMessage: undefined, expectedMessage: mockException.message },
            { hideError: true, customMessage: undefined, expectedMessage: defaultErrorMessage },
            { hideError: undefined, customMessage: undefined, expectedMessage: defaultErrorMessage },
            { hideError: false, customMessage: customErrorMessage, expectedMessage: mockException.message },
            { hideError: true, customMessage: customErrorMessage, expectedMessage: customErrorMessage },
            { hideError: undefined, customMessage: customErrorMessage, expectedMessage: customErrorMessage },
        ])('when hideError is $hideError and custom message provided is $customMessage should return expected error message', ({ hideError, customMessage, expectedMessage }) => {
            const responseError = {
                hideError: hideError,
                message: customMessage
            };
            const httpResponse = new HttpResponse(mockException, responseError);

            httpResponse.createResponse(mockResponse);

            const sentBody = mockResponse.json.mock.calls[0][0];
            expect(sentBody.message).toBe(expectedMessage);
        });
    });

    describe('response structure and headers', () => {
        test('when only header is provided should include Retry-After header', () => {
            const retryAfter = 120;
            const responseError = { retryAfter };
            const httpResponse = new HttpResponse(mockException, responseError);

            httpResponse.createResponse(mockResponse);

            expect(mockResponse.set).toHaveBeenCalledWith('Retry-After', String(retryAfter));
        });

        test('should use custom code and response body from ResponseError', () => {
            const expectedCode = 500;
            const expectedResponse = { custom: 'data' };
            const responseError = {
                code: expectedCode,
                response: expectedResponse
            };
            const httpResponse = new HttpResponse(mockException, responseError);

            httpResponse.createResponse(mockResponse);

            expect(mockResponse.status).toHaveBeenCalledWith(expectedCode);
            expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining(expectedResponse));
        });
    });
});
