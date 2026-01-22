import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HttpAdapterHost } from '@nestjs/core';
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';

@Module({
  imports: [
    PidControllerModule.forRoot(
      {
        pidConfig: {
          capacity:{
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
      }
    )
  ],
  controllers: [AppController],
  providers: [HttpAdapterHost],
  exports: [HttpAdapterHost]
})
export class AppModule { }
