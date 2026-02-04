# PID Controller - NestJS adapter

This is the **NestJS** adapter for the [PID Controller](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/core). It provides a seamless way to integrate adaptive rate limiting and load shedding into your NestJS applications using a global Guard and an Interceptor-based flow.

## Features

## Installation

```bash
npm install @jfrz38/pid-controller-nestjs
```

## Configuration

Configuration objects allow three values, where `config` is the same as explained into [PID core](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/code/core/README.md#Configuration%20Reference):

| Parameter                     | Type                       | Default                     | Description                                                                  |
|-------------------------------|----------------------------|-----------------------------|------------------------------------------------------------------------------|
| `pid.config`                  | Parameters                 | -                           | Configuration for the PID engine. See core for more information.             |
| `pid.priority.getPriority`    | `(req: Request) => number` | `req.headers['x-priority']` | Function to get priority from the request.                                   |
| `http`                        | `PidHttpRules`             | -                           | HTTP policies: Response status and message error                             |
| `routes.excludeRoutes`        | string[]                   | `[]`                        | Routes to be ignored                                                         |
| `routes.allowedRoutes.paths`  | string                     | `'*'`                       | paths to be protected                                                        |
| `routes.allowedRoutes.method` | `RequestMethod`            | `RequestMethod.ALL`         | HTTP method where the protection applies                                     |

## Quick Start

Import the `PidControllerModule` into your `AppModule` using the forRoot static method:

```ts
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';
import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppController } from './app.controller';

@Module({
  imports: [
    PidControllerModule.forRoot({
      pid: {
        config: {
          capacity: {
            cores: 1,
            maxConcurrentRequests: 2
          },
          log: { level: 'debug' },
          statistics: {
            minRequestsForLatencyPercentile: 10,
            minRequestsForStats: 10
          }
        },
        priority: {
          // Define how to extract priority from the request
          getPriority: (req) => req.get('x-priority') || 5
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
    })
  ],
  controllers: [AppController],
  providers: [HttpAdapterHost],
  exports: [HttpAdapterHost]
})
export class AppModule { }
```

## How it works

The adapter automatically registers a global `Middleware` and `Filter`:

- **Middleware**: Intercepts the request and checks with the PID engine if it should be admitted based on the current threshold. If rejected, it throws a `RejectedRequestException` which is handled by the **filter*.
- **Filter**: If PID controller throw an exception it is handled by this filter automatically.

## Error Handling

When the controller decides to reject the request due to low priority, it throws a specific internal error that is handled by an internal filter.

- **Default Behavior**: Returns `429 Too Many Request`.
- **Customization**: You can override the status code and response body using the rules parameter during initialization.
