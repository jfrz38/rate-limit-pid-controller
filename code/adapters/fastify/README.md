# PID Controller - Fastify adapter

Fastify 5 plugin for the Rust/WebAssembly adaptive admission controller. It waits for admission
without blocking the event loop and keeps admitted work in flight until the HTTP response really
finishes, including streaming responses.

## Requirements

- Node.js 24 or newer
- Fastify 5
- `@jfrz38/adaptive-admission-node` 0.1

## Installation

```bash
npm install @jfrz38/pid-controller-fastify fastify @jfrz38/adaptive-admission-node
```

## Quick start

```js
import Fastify from 'fastify';
import { pidControllerPlugin } from '@jfrz38/pid-controller-fastify';

const app = Fastify();

await app.register(pidControllerPlugin, {
  pid: {
    config: {
      maxConcurrentRequests: 10,
      maxQueuedRequests: 100,
      queueTimeoutMs: 500,
    },
    priority: {
      getPriority: (request) => request.headers['x-priority'],
    },
  },
});

app.get('/work', async () => ({ ok: true }));

await app.listen({ port: 3000 });
```

Lower priority tiers run first: `0` is the highest tier and `5` is the lowest. Missing, invalid, or
throwing priority extractors use the host's default priority.

## Plugin scope

The plugin protects routes registered after it in the current Fastify scope. Registering it on the
root instance protects the application. Registering it inside an encapsulated plugin creates an
independent controller for that scope:

```js
await app.register(async (scope) => {
  await scope.register(pidControllerPlugin, {
    pid: { config: { maxConcurrentRequests: 2 } },
  });

  scope.get('/protected', async () => ({ ok: true }));
});
```

The first version intentionally does not combine scope protection with per-route selection.

## Admission errors

Only admission errors are converted into HTTP responses. Application errors and host configuration
or protocol errors remain under Fastify's error handling.

| Host error | Default status |
|---|---:|
| `ThresholdRejectedError` | `429` |
| `QueueFullError` | `503` |
| `EvictedRequestError` | `503` |
| `ControllerShutdownError` | `503` |
| `CancelledRequestError` | `499` while the connection is still writable |

Customize the response with the shared HTTP policy:

```js
await app.register(pidControllerPlugin, {
  http: {
    error: {
      code: 503,
      title: 'BUSY',
      message: 'Try again shortly.',
      retryAfter: 2,
      // response: { custom: true },
      // hideError: true,
    },
  },
});
```

No response is attempted after the client disconnects or Fastify has already sent the reply.

## Lifecycle

- Queued requests are cancelled when their client disconnects.
- A disconnect or Fastify connection timeout after admission completes the work as `failure`.
- A response that finishes writing completes as `success`, regardless of its HTTP status.
- A premature close or response stream error completes as `failure`.
- Streams retain their permit until the stream finishes or its connection closes.
- `app.close()` shuts down the controller automatically from Fastify's `onClose` lifecycle. Fastify
  first lets active HTTP lifecycles settle according to its own close policy; the controller then
  rejects later use and clears its remaining internal work.

Each plugin registration limits only its own Node.js process or worker. It does not coordinate
admission across processes, containers, or hosts.

## License

MIT
