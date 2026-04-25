# PID Controller - NestJS adapter

[![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/jfrz38/rate-limit-pid-controller/build-nestjs.yml)](https://github.com/jfrz38/rate-limit-pid-controller/actions/workflows/build-nestjs.yml)
[![types](https://img.shields.io/npm/types/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)
[![license](https://img.shields.io/npm/l/@jfrz38/pid-controller-nestjs)](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dm/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)

This is the **NestJS** adapter for the [PID Controller](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/core). It provides a seamless way to integrate adaptive rate limiting and load shedding into your NestJS applications using a global _Middleware_ on each request and a _Filter_ to handle errors.

> [!NOTE]  
> See [core project](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/core) for more information.

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
| `http`                        | `PidHttpRules`             | -                           | HTTP policies: Response status and message error  (see below)                |

## Http Rules configuration

| Parameter                          | Type            | Default                                    | Description                                                                                     |
|------------------------------------|-----------------|--------------------------------------------|-------------------------------------------------------------------------------------------------|
| `http.error.message`               | string          | Too many requests, please try again later. | A custom descriptive message for the error                                                      |
| `http.error.retryAfter`            | number          | -                                          | The value in seconds for the 'Retry-After' HTTP header                                          |
| `http.error.code`                  | number          | 429                                        | The HTTP status code to return.                                                                 |
| `http.error.response`              | object          | object with default `title` and `message`  | The custom JSON body object to be sent to the client.                                           |
| `http.error.title`                 | string          | RATE_LIMIT_EXCEEDED                        | A short string representing the error title or category.                                        |
| `http.error.hideError`             | boolean         | `true`                                     | If true, prevents the internal PID exception message from being included in the final response. |
| `http.routes.excludeRoutes`        | string[]        | `[]`                                       | Routes to be ignored                                                                            |
| `http.routes.allowedRoutes.paths`  | string          | `'*'`                                      | paths to be protected                                                                           |
| `http.routes.allowedRoutes.method` | `RequestMethod` | `RequestMethod.ALL`                        | HTTP method where the protection applies                                                        |

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
        error: {
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
