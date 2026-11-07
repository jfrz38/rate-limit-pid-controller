# PID Controller - Fastify adapter

[![npm](https://img.shields.io/npm/v/@jfrz38/pid-controller-fastify)](https://www.npmjs.com/package/@jfrz38/pid-controller-fastify)
[![types](https://img.shields.io/npm/types/@jfrz38/pid-controller-fastify)](https://www.npmjs.com/package/@jfrz38/pid-controller-fastify)
[![license](https://img.shields.io/npm/l/@jfrz38/pid-controller-fastify)](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dm/@jfrz38/pid-controller-fastify)](https://www.npmjs.com/package/@jfrz38/pid-controller-fastify)

Fastify plugin for the Rust/WebAssembly
[Adaptive Admission Node host](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node).
It adds priority-aware admission, bounded queueing, adaptive load shedding, and concurrency control
to Fastify applications without blocking the event loop. Admitted requests retain their capacity
until the HTTP response finishes, including streaming responses.

## Features

- **Fastify plugin**: register admission control through the standard `app.register()` API.
- **Adaptive admission**: use the Node host's queue, threshold, concurrency, statistics, and PID feedback.
- **Priority extraction**: derive a request tier from headers, authentication, route data, or any other `FastifyRequest` property.
- **Scoped controllers**: create independent admission state for separate Fastify scopes.
- **HTTP error mapping**: convert admission errors without taking ownership of application errors.
- **Streaming lifecycle**: retain capacity until a stream finishes or its connection closes.
- **Automatic shutdown**: shut the controller down through Fastify's application lifecycle.
- **TypeScript support**: publish typed plugin options and a typed priority extractor.

## Requirements

| Requirement | Supported version |
|---|---|
| Node.js | 24 or newer |
| Fastify | 5 |
| Module system | ESM |

CommonJS `require()` is not supported. Fastify and `@jfrz38/adaptive-admission-node` are peer
dependencies.

## Installation

Install the adapter in an existing Fastify application:

```bash
npm install @jfrz38/pid-controller-fastify
```

npm 7 and newer installs compatible peer dependencies automatically. Install them explicitly when
you want to control their versions:

```bash
npm install @jfrz38/pid-controller-fastify @jfrz38/adaptive-admission-node fastify
```

## Quick start

Register the plugin before the routes it should protect:

```ts
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
      getPriority: (request) => {
        const header = request.headers['x-priority'];
        return Array.isArray(header) ? header[0] : header;
      },
    },
  },
});

app.get('/work', async () => ({ ok: true }));

await app.listen({ port: 3000 });

const close = async () => {
  await app.close();
};

process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `pid.config` | `ControllerOptions` | Node host defaults | Configures admission, queueing, statistics, and PID feedback. |
| `pid.priority.getPriority` | `(request: FastifyRequest) => number \| string \| undefined` | Tier 5 | Extracts a priority tier from the Fastify request. |
| `http.error` | `ResponseError` | Policy for each admission error | Customizes admission error status, headers, and body. |

`pid.config` accepts the Node host's native `ControllerOptions`. See the
[Node host configuration reference](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node#configuration)
for every option and default.

### Priorities

Priority tiers range from `0` (highest priority) to `5` (lowest priority). Lower tiers are admitted
first when requests wait for capacity; requests with the same effective priority remain FIFO.
Missing values, non-finite values, and priority extractors that throw use the default tier.

The extractor receives the real `FastifyRequest`, so it can use headers, authentication context,
route parameters, or other request metadata:

```ts
await app.register(pidControllerPlugin, {
  pid: {
    priority: {
      getPriority: (request) => request.routeOptions.url.startsWith('/critical') ? 0 : 5,
    },
  },
});
```

## Plugin scope

The plugin protects routes registered after it in the current Fastify scope. Registering it on the
root instance protects subsequent application routes:

```ts
await app.register(pidControllerPlugin, {
  pid: { config: { maxConcurrentRequests: 10 } },
});

app.get('/protected', async () => ({ ok: true }));
```

Register it inside an encapsulated plugin to create an independent controller for that scope:

```ts
await app.register(async (scope) => {
  await scope.register(pidControllerPlugin, {
    pid: { config: { maxConcurrentRequests: 2 } },
  });

  scope.get('/protected', async () => ({ ok: true }));
});
```

Each registration owns its queue, threshold, concurrency, statistics, and PID state. Route
protection is scope-based; the plugin does not implement per-route inclusion or exclusion rules.

## HTTP error responses

Only admission errors are converted into HTTP responses. Application errors remain under the
consumer's Fastify error handler, while host configuration and protocol errors remain distinct.

| Host error | Default HTTP status |
|---|---:|
| `ThresholdRejectedError` | `429` |
| `QueueFullError` | `503` |
| `EvictedRequestError` | `503` |
| `ControllerShutdownError` | `503` |
| `CancelledRequestError` | `499` while the connection remains writable |

The adapter does not attempt to write after the client disconnects or Fastify sends the response.
A fully rendered response counts as a successful HTTP lifecycle regardless of whether its status is
`2xx`, `4xx`, or `5xx`.

### Error response configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `http.error.message` | `string` | Depends on the host error | Sets the public message. |
| `http.error.title` | `string` | Depends on the host error | Sets the public error category. |
| `http.error.code` | `number` | Depends on the host error | Overrides the HTTP status. |
| `http.error.retryAfter` | `number` | No header | Sets `Retry-After` in seconds. |
| `http.error.response` | `object` | `{ error, message }` | Replaces the complete JSON body. |
| `http.error.hideError` | `boolean` | `true` | Prevents the internal admission error message from being exposed. |

```ts
await app.register(pidControllerPlugin, {
  http: {
    error: {
      code: 503,
      title: 'SERVICE_BUSY',
      message: 'Try again shortly.',
      retryAfter: 2,
    },
  },
});
```

## Request lifecycle

1. The plugin waits for admission before Fastify executes the route handler.
2. A queued request is cancelled if its client disconnects.
3. Once admitted, work is not cancelled in the core and must reach an HTTP terminal event.
4. A response that finishes writing completes as `success`.
5. A premature close, response stream error, client disconnect, or connection timeout completes as `failure`.
6. A streaming response retains its permit until the stream finishes or its connection closes.
7. Competing terminal events are reported to the controller exactly once.

Business outcomes and HTTP status classes do not determine the admission outcome. `success` means
that the HTTP response completed; `failure` means that the response lifecycle could not complete.

## Shutdown

`app.close()` shuts down the controller through Fastify's `onClose` lifecycle. Fastify first lets
active HTTP lifecycles settle according to its close policy, then the controller rejects later use
and clears its remaining internal work. No controller handle or manual shutdown call is exposed by
the plugin.

One plugin registration limits only its Node.js process or worker. Instances do not coordinate
admission across workers, processes, containers, or hosts.

## How it works

- An entry hook waits for an admission permit before the request pipeline continues.
- Fastify and Node response events complete the permit from the real HTTP lifecycle.
- Admission errors are mapped through the configured HTTP response policy.
- Unknown and application errors continue through Fastify's normal error handling.
- Fastify application close triggers the controller's idempotent shutdown.

## More information

For the admission algorithm, architecture, and framework packages, see the
[main project documentation](https://github.com/jfrz38/rate-limit-pid-controller).

For controller configuration, priorities, errors, lifecycle, and diagnostics, see the
[Adaptive Admission Node host documentation](https://github.com/jfrz38/rate-limit-pid-controller/tree/main/code/hosts/node).

For the portable Rust/WebAssembly controller, see
[`adaptive-admission-controller`](https://github.com/jfrz38/adaptive-admission-controller).

## License

Distributed under the
[MIT License](https://github.com/jfrz38/rate-limit-pid-controller/blob/main/LICENSE).
