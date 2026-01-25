import { RequestMethod } from '@nestjs/common';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PidRoutes } from '../../src/error/routes/pid-routes';
import { PidControllerModule } from '../../src/module/pid-controller.module';
import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { APP_FILTER } from '@nestjs/core';
import { PidExceptionFilter } from '../../src/filter/pid-exception.filter';

describe('PidControllerModule', () => {
    const pidProvider = 'PID_CONTROLLER';
    const optionsProvider = 'PID_CONTROLLER_OPTIONS';
    let mockOptions: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOptions = {
            pidConfig: { kP: 0.1, kI: 0.01, kD: 0, targetLatency: 200 },
            rules: {
                routes: {
                    excludeRoutes: ['health'],
                    allowedRoutes: { paths: 'api/*', method: RequestMethod.GET }
                }
            }
        };
    });

    describe('forRoot', () => {
        test('when forRoot is called should return a dynamic module with correct providers and exports', () => {
            const dynamicModule = PidControllerModule.forRoot(mockOptions);

            expect(dynamicModule.module).toBe(PidControllerModule);
            expect(dynamicModule.providers).toContainEqual(
                expect.objectContaining({ provide: optionsProvider, useValue: mockOptions })
            );
            expect(dynamicModule.exports).toContain(pidProvider);
            expect(dynamicModule.exports).toContain(optionsProvider);
        });

        test('when forRoot is called should include expected pid controller factory that instantiates the rate limit controller', () => {
            const dynamicModule = PidControllerModule.forRoot(mockOptions);
            const controllerProvider = dynamicModule.providers?.find(
                (p: any) => p.provide === pidProvider
            ) as any;

            expect(controllerProvider.useFactory).toBeDefined();
            const controller = controllerProvider.useFactory();
            expect(controller).toBeDefined();
        });

        test('when forRoot is called should include APP_FILTER factory that instantiates PidExceptionFilter', () => {
            const dynamicModule = PidControllerModule.forRoot(mockOptions);
            const filterProvider = dynamicModule.providers?.find(
                (p: any) => p.provide === APP_FILTER
            ) as any;

            expect(filterProvider.useFactory).toBeDefined();
            
            const filter = filterProvider.useFactory();
            
            expect(filter).toBeInstanceOf(PidExceptionFilter);
        });

        test('when forRoot is called should include PidControllerMiddlewareHandler factory with correct injection', () => {
            const dynamicModule = PidControllerModule.forRoot(mockOptions);
            const handlerProvider = dynamicModule.providers?.find(
                (p: any) => p.provide === PidControllerMiddlewareHandler
            ) as any;

            expect(handlerProvider.useFactory).toBeDefined();
            expect(handlerProvider.inject).toContain('PID_CONTROLLER');

            const mockController = {} as any;
            
            const handler = handlerProvider.useFactory(mockController);
            
            expect(handler).toBeInstanceOf(PidControllerMiddlewareHandler);
        });
    });

    describe('configure', () => {
        test('when configure is called should apply middleware with correct exclusions and routes', () => {
            const mockConsumer = {
                apply: vi.fn().mockReturnThis(),
                exclude: vi.fn().mockReturnThis(),
                forRoutes: vi.fn().mockReturnThis(),
            };

            const generateSpy = vi.spyOn(PidRoutes, 'generate').mockReturnValue({
                excludeRoutes: ['health'],
                allowedRoutes: { paths: 'api/*', method: RequestMethod.GET }
            });

            const moduleInstance = new PidControllerModule(mockOptions);
            moduleInstance.configure(mockConsumer as any);

            expect(generateSpy).toHaveBeenNthCalledWith(1, mockOptions.rules.routes);
            expect(mockConsumer.apply).toHaveBeenNthCalledWith(1, expect.any(Function));
            expect(mockConsumer.exclude).toHaveBeenNthCalledWith(1, 'health');
            expect(mockConsumer.forRoutes).toHaveBeenNthCalledWith(1, {
                path: 'api/*',
                method: RequestMethod.GET
            });
        });

        test('when configure is called with no specific routes should use generated defaults', () => {
            const mockConsumer = {
                apply: vi.fn().mockReturnThis(),
                exclude: vi.fn().mockReturnThis(),
                forRoutes: vi.fn().mockReturnThis(),
            };

            const moduleInstance = new PidControllerModule({});
            moduleInstance.configure(mockConsumer as any);

            expect(mockConsumer.apply).toHaveBeenCalledTimes(1);
            expect(mockConsumer.forRoutes).toHaveBeenCalledTimes(1);
        });
    });
});
