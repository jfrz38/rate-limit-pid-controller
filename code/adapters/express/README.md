# Adaptive Admission — Express adapter

Express middleware backed by the Rust/WebAssembly controller in `@jfrz38/adaptive-admission-node`.

## Requirements

- Node.js 24 or newer
- Express 4 or 5
- ESM (the adapter no longer exposes a CommonJS entrypoint)

## Installation

```bash
npm install @jfrz38/pid-controller-express @jfrz38/adaptive-admission-node express
```

## Usage

```js
import express from 'express';
import {
  pidControllerErrorHandler,
  pidControllerMiddleware,
} from '@jfrz38/pid-controller-express';

const app = express();
const { middleware, shutdown } = pidControllerMiddleware({
  pid: {
    config: {
      initialThreshold: 768,
      maxConcurrentRequests: 16,
      maxQueuedRequests: 256,
      queueTimeoutMs: 500,
      pid: { proportionalGain: 0.2, intervalMs: 1_000 },
    },
    priority: {
      getPriority: (request) => request.get('x-priority'),
    },
  },
});

app.use(middleware);
app.get('/', (_request, response) => response.json({ ok: true }));
app.use(pidControllerErrorHandler());

const server = app.listen(3000);
process.once('SIGTERM', () => {
  shutdown();
  server.close();
});
```

Priority extractors return a tier from `0` (highest) to `5` (lowest). Invalid values use the default lowest tier. `pid.config` is the native `ControllerOptions` contract exported by the Node host; legacy TypeScript core option names are not translated.

## HTTP errors

| Host error | Default status |
|---|---:|
| `ThresholdRejectedError` | 429 |
| `QueueFullError` | 503 |
| `EvictedRequestError` | 503 |
| `ControllerShutdownError` | 503 |
| `CancelledRequestError` | 499, unless the connection is already closed |

`ConfigurationError`, `ControllerProtocolError`, and application failures are passed to the next Express error handler. Pass a `ResponseError` to `pidControllerErrorHandler()` to override the status, body, title, message, or `Retry-After` header for controlled errors.

Always call `shutdown()` when the application stops or replaces the middleware instance.
