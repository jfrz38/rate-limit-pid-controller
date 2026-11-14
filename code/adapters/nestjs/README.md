# PID Controller - NestJS adapter

[![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/jfrz38/rate-limit-pid-controller/build-nestjs.yml)](https://github.com/jfrz38/rate-limit-pid-controller/actions/workflows/build-nestjs.yml)
[![types](https://img.shields.io/npm/types/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)
[![license](https://img.shields.io/npm/l/@jfrz38/pid-controller-nestjs)](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dm/@jfrz38/pid-controller-nestjs)](https://www.npmjs.com/package/@jfrz38/pid-controller-nestjs)

This is the **NestJS** adapter for the Rust/WebAssembly [Adaptive Admission Node host](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node). It integrates adaptive rate limiting and load shedding through global middleware and an exception filter.

> [!IMPORTANT]
> Version `0.2.0` is an ESM-only breaking release, requires Node.js 24 or newer, and uses the host's native `ControllerOptions` configuration.

## Supported platforms

| Requirement | Supported versions |
|---|---|
| Node.js | 24 or newer |
| NestJS | 10, 11, and 12 |
| HTTP platform | `@nestjs/platform-express` or `@nestjs/platform-fastify` |
| Module system | ESM |

The same integration suite runs against both HTTP platforms for every supported NestJS major.

## Features

- **Global Middleware**: Applies adaptive admission to configured HTTP routes.
- **Exception Filter**: Converts operational request errors into configurable HTTP responses.
- **Route Selection**: Supports included methods and excluded paths.
- **Lifecycle Integration**: Shuts the controller down with the NestJS module and application.
- **Dual HTTP platform support**: Uses Nest and Node HTTP boundaries instead of depending on Express internals.

## Installation

```bash
npm install @jfrz38/pid-controller-nestjs
```

The Node host, `@nestjs/common`, and `@nestjs/core` are peer dependencies. The application provides
one Nest HTTP platform. Express is not required by applications that use Fastify.

For an Express application:

```bash
npm install @jfrz38/pid-controller-nestjs @jfrz38/adaptive-admission-node @nestjs/common @nestjs/core express
```

Install `@nestjs/platform-express` rather than a bare Express dependency when it is not already
present in the application:

```bash
npm install @jfrz38/pid-controller-nestjs @jfrz38/adaptive-admission-node @nestjs/common @nestjs/core @nestjs/platform-express
```

For a Fastify application:

```bash
npm install @jfrz38/pid-controller-nestjs @jfrz38/adaptive-admission-node @nestjs/common @nestjs/core @nestjs/platform-fastify
```

## Configuration

The adapter preserves the existing `pid.config` and `pid.priority` wrapper. `pid.config` now accepts the Node host's native [`ControllerOptions`](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node#configuration); legacy TypeScript `Parameters` are not translated.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `pid.config` | `ControllerOptions` | Host defaults | Adaptive admission, queue, statistics, and PID configuration. |
| `pid.priority.getPriority` | `(req) => number \| string \| undefined` | Lowest priority tier | Extracts a tier from the Nest middleware request. Use `headers` for portable access. |
| `http` | `PidHttpRules` | - | HTTP response policy for operational request errors. |
| `routes` | `PidRoutesConfig` | All routes | Selects protected and excluded routes. |

## HTTP Rules configuration

| Parameter | Type | Default | Description |
|---|---|---|---|
| `http.error.message` | `string` | Depends on the host error | Custom public error message. |
| `http.error.retryAfter` | `number` | - | Value in seconds for the `Retry-After` header. |
| `http.error.code` | `number` | Depends on the host error | Overrides the default HTTP status. |
| `http.error.response` | `object` | Object with `error` and `message` | Custom JSON body. |
| `http.error.title` | `string` | Depends on the host error | Public error category. |
| `http.error.hideError` | `boolean` | `true` | Prevents the internal controller message from being exposed. |
| `routes.excludeRoutes` | `string[]` | `[]` | Routes ignored by the middleware. |
| `routes.allowedRoutes.paths` | path or paths | `'*'` | Paths protected by the middleware. |
| `routes.allowedRoutes.method` | `RequestMethod` | `RequestMethod.ALL` | HTTP method protected by the middleware. |

## Quick Start

Import `PidControllerModule` into the application module using `forRoot()`:

```ts
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    PidControllerModule.forRoot({
      pid: {
        config: {
          initialThreshold: 768,
          maxConcurrentRequests: 2,
          maxQueuedRequests: 1000,
          queueTimeoutMs: 500,
          statistics: {
            minSamples: 10,
            minPercentileSamples: 10,
          },
        },
        priority: {
          getPriority: (req) => req.headers['x-priority'] ?? 5,
        },
      },
      http: {
        error: {
          message: 'Custom message for the error',
        },
      },
      routes: {
        excludeRoutes: ['/health'],
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
```

Bootstrap with the HTTP platform selected by the application. Express remains Nest's default:

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(3000);
```

Fastify uses the same module configuration:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

const app = await NestFactory.create(AppModule, new FastifyAdapter());
app.enableShutdownHooks();
await app.listen(3000, '0.0.0.0');
```

The priority extractor can be typed explicitly without making the package depend on either
platform. Nest middleware receives an Express request on Express and a Node `IncomingMessage`
through Fastify's middleware bridge:

```ts
import type { IncomingMessage } from 'node:http';

PidControllerModule.forRoot<IncomingMessage>({
  pid: {
    priority: {
      getPriority: (request) => request.headers['x-priority'],
    },
  },
});
```

## How it works

The adapter automatically registers global middleware and a filter:

- **Middleware**: Waits for admission before executing the request pipeline and tracks completion through Node HTTP response events shared by both Nest platforms.
- **Filter**: Uses Nest's `HttpAdapterHost` to map `AdmissionRequestError` without platform-specific response calls.
- **Lifecycle**: `OnModuleDestroy` and `OnApplicationShutdown` call the controller's idempotent `shutdown()` method.
- **Providers**: Existing `PID_CONTROLLER` and `PID_CONTROLLER_OPTIONS` tokens remain exported.

## Error Handling

| Host error | Default HTTP status |
|---|---:|
| `ThresholdRejectedError` | `429` |
| `QueueFullError` | `503` |
| `EvictedRequestError` | `503` |
| `ControllerShutdownError` | `503` |
| `CancelledRequestError` | `499` while the connection remains open; no response after disconnect |

All these errors extend `AdmissionRequestError`. `ConfigurationError`, `ControllerProtocolError`, non-HTTP contexts, and application errors are left to NestJS instead of being converted into admission responses.

Queued work is cancelled when the client disconnects. Once admitted, a request retains capacity
until its response finishes; this includes streaming responses. A premature close or response error
finishes the admission lifecycle as a failure. One module instance limits only its Node.js process
or worker.

## Migrating from `0.1.x`

The adapter no longer accepts the TypeScript core's `Parameters` model:

| TypeScript core option | `ControllerOptions` replacement |
|---|---|
| `threshold.initial` | `initialThreshold` |
| `capacity.maxConcurrentRequests` | `maxConcurrentRequests` |
| `interval.maxRequests` | `maxQueuedRequests` |
| `timeout.priorityQueue.value` | `queueTimeoutMs` |
| `timeout.priorityQueue.ratio` | `queueTimeoutRatio` |
| `interval.requestInterval.minIntervalTime` (seconds) | `statistics.minWindowMs` (milliseconds) |
| `interval.requestInterval.maxIntervalTime` (seconds) | `statistics.maxWindowMs` (milliseconds) |
| `statistics.minRequestsForStats` | `statistics.minSamples` |
| `statistics.minRequestsForLatencyPercentile` | `statistics.minPercentileSamples` |
| `statistics.latencyPercentile` | `statistics.latencyPercentile` |
| `pid.KP` | `pid.proportionalGain` |
| `pid.KI` | `pid.integralGain` |
| `pid.KD` | `pid.derivativeGain` |
| `pid.interval` | `pid.intervalMs` |
| `pid.delta` | `pid.maxDeltaPercentage` |
| `pid.decayRatio` | `pid.integralDecay` |
| `log` | No direct replacement; subscribe to host diagnostics. |

CommonJS `require()` is no longer supported. Use ESM `import` and consult the [Node host configuration reference](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node#configuration) for defaults and additional options.

## More information

For an overview of the PID-based admission-control strategy, motivation, and references, see the
[main project documentation](https://github.com/jfrz38/rate-limit-pid-controller).

For controller configuration, lifecycle, diagnostics, and errors, see the
[Node host documentation](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node).

## License

Distributed under the
[MIT License](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE).
