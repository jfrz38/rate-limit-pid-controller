import { PidControllerRateLimit } from '@jfrz38/pid-controller-core';
import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { DynamicModule, Global, Inject, MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PidRoutes } from '../error/routes/pid-routes';
import { PidExceptionFilter } from '../filter/pid-exception.filter';
import { PidControllerMiddleware } from '../middleware/pid-controller.middleware';
import { NestPidModuleOptions } from '../types/nest-pid-module-options';

@Global()
@Module({})
export class PidControllerModule {
  private options: NestPidModuleOptions;

  static forRoot(options: NestPidModuleOptions): DynamicModule {
    return {
      module: PidControllerModule,
      imports: [],
      providers: [
        {
          provide: 'PID_CONTROLLER_OPTIONS',
          useValue: options,
        },
        {
          provide: 'PID_CONTROLLER',
          useFactory: () => new PidControllerRateLimit(options.pid?.config),
        },
        {
          provide: APP_FILTER,
          useFactory: () => new PidExceptionFilter(options?.rules?.error),
        },
        {
          provide: PidControllerMiddlewareHandler,
          useFactory: (controller: PidControllerRateLimit) => new PidControllerMiddlewareHandler(controller, options.pid?.priority),
          inject: ['PID_CONTROLLER', 'PID_CONTROLLER_OPTIONS']
        }
      ],
      exports: ['PID_CONTROLLER', 'PID_CONTROLLER_OPTIONS'],
    };
  }

  constructor(@Inject('PID_CONTROLLER_OPTIONS') options: NestPidModuleOptions) {
    this.options = options;
  }

  configure(consumer: MiddlewareConsumer) {
    const {
      excludeRoutes,
      allowedRoutes
    } = PidRoutes.generate(this.options?.routes);

    consumer
      .apply(PidControllerMiddleware)
      .exclude(...excludeRoutes)
      .forRoutes({ path: allowedRoutes.paths, method: allowedRoutes.method! });
  }
}
