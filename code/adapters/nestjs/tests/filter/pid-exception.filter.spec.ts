import { RejectedRequestException } from '@jfrz38/pid-controller-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PidExceptionFilter } from '../../src/filter/pid-exception.filter';

describe('PidExceptionFilter', () => {
    let filter: PidExceptionFilter;
    let mockOptions: any;
    let mockArgumentsHost: any;
    let mockResponse: any;

    const mockException = new RejectedRequestException(0, 0);

    beforeEach(() => {
        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        };

        mockArgumentsHost = {
            getType: vi.fn().mockReturnValue('http'),
            switchToHttp: vi.fn().mockReturnValue({
                getResponse: vi.fn().mockReturnValue(mockResponse),
                getRequest: vi.fn(),
            }),
        };

        mockOptions = {
            response: {
                error: {
                    code: 429,
                    hideError: true,
                },
            },
        };

        filter = new PidExceptionFilter(mockOptions);
    });

    describe('Context validation', () => {
        test('when context type is not http should rethrow the exception', () => {
            mockArgumentsHost.getType.mockReturnValue('rpc');

            expect(() => filter.catch(mockException, mockArgumentsHost)).toThrow(
                RejectedRequestException,
            );

            expect(mockArgumentsHost.switchToHttp).not.toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        test('when context type is http should process the exception and use the http response', () => {
            filter.catch(mockException, mockArgumentsHost);

            expect(mockArgumentsHost.switchToHttp).toHaveBeenCalled();
            expect(mockResponse.status).toHaveBeenCalled();
        });
    });

    describe('Response generation', () => {
        test('when valid options are provided should call response.status with the configured code', () => {
            const defaultCode = 429;
            filter.catch(mockException, mockArgumentsHost);

            expect(mockResponse.status).toHaveBeenCalledWith(defaultCode);
        });

        test('when custom response body is provided should return the configured json body', () => {
            const expectedResponse = { custom: 'body' };
            mockOptions.response.error.response = expectedResponse;

            filter.catch(mockException, mockArgumentsHost);

            expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining(expectedResponse));
        });

        test('when options are undefined should fallback to default HttpResponse behavior', () => {
            const defaultCode = 429;
            const defaultError = 'RATE_LIMIT_EXCEEDED';
            const emptyFilter = new PidExceptionFilter(undefined as any);

            emptyFilter.catch(mockException, mockArgumentsHost);

            expect(mockResponse.status).toHaveBeenCalledWith(defaultCode);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: defaultError })
            );
        });
    });
});
