import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PidControllerModule } from '../../../../../../../code/adapters/nestjs/dist/src/index';
import { HttpAdapterHost } from '@nestjs/core';

@Module({
  imports: [
    PidControllerModule.forRoot(
      {
        pidConfig: {
          log: {
            level: 'debug'
          },
          statistics: {
            minRequestsForLatencyPercentile: 10,
            minRequestsForStats: 10
          }
        },
        getPriority: (req) => req.get('x-priority')
      }
    )
  ],
  controllers: [AppController],
  providers: [HttpAdapterHost],
  exports: [HttpAdapterHost]
})
export class AppModule { }
