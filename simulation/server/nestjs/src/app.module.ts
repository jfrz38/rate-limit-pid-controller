import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';
import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppController } from './app.controller';

@Module({
  imports: [
    PidControllerModule.forRoot(
      {
        pid: {
          config: {
            threshold: {
              initial: 200
            },
            capacity: {
              cores: 1,
              maxConcurrentRequests: 2
            },
            log: {
              level: 'debug'
            },
            statistics: {
              minRequestsForLatencyPercentile: 10,
              minRequestsForStats: 10
            }
          },
          priority: {
            getPriority: (req) => req.get('x-priority')
          },
        },
        http: {
          error:{
            code: 503,
            message: 'Custom message for the error'
          }
        },
        routes: {
          excludeRoutes: ['/excluded']
        }
      }
    )
  ],
  controllers: [AppController],
  providers: [HttpAdapterHost],
  exports: [HttpAdapterHost]
})
export class AppModule { }
