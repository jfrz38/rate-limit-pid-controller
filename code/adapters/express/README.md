# PID Controller - Express adapter

[![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-express)](https://www.npmjs.com/package/@jfrz38/pid-controller-express)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/jfrz38/rate-limit-pid-controller/build-express.yml)](https://github.com/jfrz38/rate-limit-pid-controller/actions/workflows/build-express.yml)
[![types](https://img.shields.io/npm/types/@jfrz38/pid-controller-express)](https://www.npmjs.com/package/@jfrz38/pid-controller-express)
[![license](https://img.shields.io/npm/l/@jfrz38/pid-controller-express)](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dm/@jfrz38/pid-controller-express)](https://www.npmjs.com/package/@jfrz38/pid-controller-express)

This is the **Express** adapter for the Rust/WebAssembly [Adaptive Admission Node host](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node). It allows you to integrate adaptive rate limiting and load shedding into Express applications as standard middleware.

> [!IMPORTANT]
> Version `0.2.0` is an ESM-only breaking release, requires Node.js 24 or newer, and uses the host's native `ControllerOptions` configuration.

## Features

- **Middleware Integration**: Seamlessly injects the adaptive admission control loop into your request pipeline.
- **Automatic Error Handling**: Includes a specialized error handler for rejection, eviction, cancellation, and shutdown.
- **Priority Extraction**: Flexible configuration to determine request priority from headers, tokens, or any part of the Express `request` object.

## Installation

```bash
npm install @jfrz38/pid-controller-express
```

`express` and `@jfrz38/adaptive-admission-node` are peer dependencies. npm 7 and newer install compatible peer dependencies automatically when needed. Install them explicitly only when you want to control their versions:

```bash
npm install @jfrz38/pid-controller-express @jfrz38/adaptive-admission-node express
```

## Configuration

The adapter preserves the existing `pid.config` and `pid.priority` wrapper. `pid.config` now accepts the Node host's native [`ControllerOptions`](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node#configuration); legacy TypeScript `Parameters` are not translated.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `pid.config` | `ControllerOptions` | Host defaults | Adaptive admission, queue, statistics, and PID configuration. |
| `pid.priority.getPriority` | `(req: Request) => number \| string \| undefined` | Lowest priority tier | Extracts a tier from `0` (highest) to `5` (lowest). |

## Error Handler configuration

| Parameter | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | Depends on the host error | Custom public error message. |
| `retryAfter` | `number` | - | Value in seconds for the `Retry-After` header. |
| `code` | `number` | Depends on the host error | Overrides the default HTTP status. |
| `response` | `object` | Object with `error` and `message` | Custom JSON body. |
| `title` | `string` | Depends on the host error | Public error category. |
| `hideError` | `boolean` | `true` | Prevents the internal controller message from being exposed. |

## Quick Start

The adapter provides middleware to intercept requests and an error handler to manage controller outcomes:

```js
import express from 'express';
import {
  pidControllerErrorHandler,
  pidControllerMiddleware,
} from '@jfrz38/pid-controller-express';

const { middleware, shutdown } = pidControllerMiddleware({
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
      getPriority: (req) => req.get('x-priority'),
    },
  },
});

const app = express();
app.use(middleware);

app.get('/test', async (_req, res) => {
  res.json({ ok: true });
});

app.use(pidControllerErrorHandler({
  message: 'Custom message for the error',
}));

const server = app.listen(3000);
process.once('SIGTERM', () => {
  shutdown();
  server.close();
});
```

## Error Handling

| Host error | Default HTTP status |
|---|---:|
| `ThresholdRejectedError` | `429` |
| `QueueFullError` | `503` |
| `EvictedRequestError` | `503` |
| `ControllerShutdownError` | `503` |
| `CancelledRequestError` | `499` while the connection remains open; no response after disconnect |

`ConfigurationError`, `ControllerProtocolError`, and application errors are passed to the next Express error handler. Controlled responses can be customized with `pidControllerErrorHandler()`.

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

## Shutdown

Express does not provide a middleware lifecycle hook. Always call the returned `shutdown()` function when the application stops or replaces the middleware instance. It is idempotent, rejects new work, cancels queued work, and allows already-started handlers to finish.
