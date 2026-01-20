import { RequestMethod } from '@nestjs/common';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PidRoutes } from '../../src/error/routes/pid-routes';
import { PidControllerModule } from '../../src/module/pid-controller.module';

describe('PidControllerModule', () => {
    const pidProvider = 'PID_CONTROLLER';
    const optionsProvider = 'PID_CONTROLLER_OPTIONS';
    let mockOptions: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOptions = {
            pidConfig: { kP: 0.1, kI: 0.01, kD: 0, targetLatency: 200 },
            response: {
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

        test('when forRoot is called should include PID_CONTROLLER factory that instantiates the rate limit controller', () => {
            const dynamicModule = PidControllerModule.forRoot(mockOptions);
            const controllerProvider = dynamicModule.providers?.find(
                (p: any) => p.provide === pidProvider
            ) as any;

            expect(controllerProvider.useFactory).toBeDefined();
            const controller = controllerProvider.useFactory();
            expect(controller).toBeDefined();
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

            expect(generateSpy).toHaveBeenNthCalledWith(1, mockOptions.response.routes);
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
