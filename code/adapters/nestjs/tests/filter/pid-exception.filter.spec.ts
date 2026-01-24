import { RejectedRequestException } from '@jfrz38/pid-controller-core';
import { HttpErrorResponse } from '@jfrz38/pid-controller-shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PidExceptionFilter } from '../../src/filter/pid-exception.filter';

const mockFormat = vi.fn();

vi.mock('@jfrz38/pid-controller-shared', () => {
    return {
        HttpErrorResponse: vi.fn().mockImplementation(function (this: any) {
            this.format = mockFormat;
            return this;
        })
    };
});

describe('NestJS PID Controller Exception Filter', () => {
    let filter: PidExceptionFilter;
    let mockOptions: any;
    let mockArgumentsHost: any;
    let mockResponse: any;

    const mockException = new RejectedRequestException(100, 50);

    beforeEach(() => {
        vi.clearAllMocks();

        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        mockArgumentsHost = {
            getType: vi.fn().mockReturnValue('http'),
            switchToHttp: vi.fn().mockReturnValue({
                getResponse: vi.fn().mockReturnValue(mockResponse),
            }),
        };

        mockOptions = { code: 429, hideError: false };
        filter = new PidExceptionFilter(mockOptions);
    });

    describe('Context Validation', () => {
        test('should rethrow the exception if the context is not HTTP (e.g., RPC or Microservice)', () => {
            mockArgumentsHost.getType.mockReturnValue('rpc');

            expect(() => filter.catch(mockException, mockArgumentsHost)).toThrow(
                RejectedRequestException,
            );

            expect(HttpErrorResponse).not.toHaveBeenCalled();
        });

        test('should process the exception if the context is HTTP', () => {
            filter.catch(mockException, mockArgumentsHost);

            expect(mockArgumentsHost.switchToHttp).toHaveBeenCalled();
            expect(HttpErrorResponse).toHaveBeenCalled();
        });
    });

    describe('Delegation to Shared Library', () => {
        test('should instantiate HttpErrorResponse with exception and options', () => {
            filter.catch(mockException, mockArgumentsHost);

            expect(HttpErrorResponse).toHaveBeenCalledWith(mockException, mockOptions);
        });

        test('should call the format method with the express response object', () => {
            filter.catch(mockException, mockArgumentsHost);

            expect(mockFormat).toHaveBeenCalledWith(mockResponse);
        });

        test('should work correctly even if options are undefined', () => {
            const emptyFilter = new PidExceptionFilter(undefined);

            emptyFilter.catch(mockException, mockArgumentsHost);

            expect(HttpErrorResponse).toHaveBeenCalledWith(mockException, undefined);
            expect(mockFormat).toHaveBeenCalled();
        });
    });
});
