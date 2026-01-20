import { PidControllerRateLimit } from '@jfrz38/pid-controller-core';
import { DynamicModule, Global, Inject, MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PidRoutes } from '../error/routes/pid-routes';
import { PidExceptionFilter } from '../filter/pid-exception.filter';
import { PidControllerMiddleware } from '../middleware/pid-controller.middleware';
import { PidModuleOptions } from '../types/options';

@Global()
@Module({})
export class PidControllerModule {
  private options: PidModuleOptions;

  static forRoot(options: PidModuleOptions): DynamicModule {
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
          useFactory: () => new PidControllerRateLimit(options.pidConfig),
        },
        {
          provide: APP_FILTER,
          useClass: PidExceptionFilter,
        },
        PidControllerMiddleware
      ],
      exports: ['PID_CONTROLLER', 'PID_CONTROLLER_OPTIONS'],
    };
  }

  constructor(@Inject('PID_CONTROLLER_OPTIONS') options: PidModuleOptions) {
    this.options = options;
  }

  configure(consumer: MiddlewareConsumer) {
    const {
      excludeRoutes,
      allowedRoutes
    } = PidRoutes.generate(this.options?.response?.routes);

    consumer
      .apply(PidControllerMiddleware)
      .exclude(...excludeRoutes)
      .forRoutes({ path: allowedRoutes.paths, method: allowedRoutes.method! });
  }
}
