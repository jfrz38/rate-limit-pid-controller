import { PidControllerRateLimit } from '@jfrz38/pid-controller-core';
import { PidControllerMiddlewareHandler } from '@jfrz38/pid-controller-shared';
import { DynamicModule, Global, Inject, MiddlewareConsumer, Module, OnApplicationShutdown, OnModuleDestroy, Optional } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PidRoutes } from '../error/routes/pid-routes';
import { PidExceptionFilter } from '../filter/pid-exception.filter';
import { PidControllerMiddleware } from '../middleware/pid-controller.middleware';
import { NestPidModuleOptions } from '../types/nest-pid-module-options';

@Global()
@Module({})
export class PidControllerModule implements OnModuleDestroy, OnApplicationShutdown {
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
          useFactory: () => new PidExceptionFilter(options?.http?.error),
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

  constructor(
    @Inject('PID_CONTROLLER_OPTIONS') options: NestPidModuleOptions,
    @Optional() @Inject('PID_CONTROLLER') private readonly controller?: PidControllerRateLimit
  ) {
    this.options = options;
  }

  onModuleDestroy(): void {
    this.controller?.shutdown();
  }

  onApplicationShutdown(): void {
    this.controller?.shutdown();
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
