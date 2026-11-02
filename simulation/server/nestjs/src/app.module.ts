import { PidControllerModule } from '../../../../code/adapters/nestjs/dist/index.js';
import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    PidControllerModule.forRoot(
      {
        pid: {
          config: {
            initialThreshold: 768,
            maxConcurrentRequests: 2,
            statistics: {
              minPercentileSamples: 10,
              minSamples: 10
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
