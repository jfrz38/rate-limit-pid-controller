# Adaptive Admission — NestJS adapter

Global NestJS middleware and exception filtering backed by the Rust/WebAssembly adaptive admission controller.

## Requirements

- Node.js 24 or newer
- NestJS 10, 11, or 12 with the Express platform
- ESM (the adapter no longer exposes a CommonJS entrypoint)

## Installation

```bash
npm install @jfrz38/pid-controller-nestjs @jfrz38/adaptive-admission-node
```

## Usage

```ts
import { PidControllerModule } from '@jfrz38/pid-controller-nestjs';
import { Module, RequestMethod } from '@nestjs/common';

@Module({
  imports: [
    PidControllerModule.forRoot({
      pid: {
        config: {
          initialThreshold: 768,
          maxConcurrentRequests: 16,
          maxQueuedRequests: 256,
          queueTimeoutMs: 500,
        },
        priority: { getPriority: (request) => request.get('x-priority') },
      },
      routes: {
        excludeRoutes: ['/health'],
        allowedRoutes: { paths: '*', method: RequestMethod.ALL },
      },
    }),
  ],
})
export class AppModule {}
```

`pid.config` accepts the host's native `ControllerOptions`; legacy TypeScript core configuration is not translated. Priority extractors return tiers from `0` to `5`.

The global filter maps threshold rejection to 429 and queue full, eviction, and shutdown to 503. Cancellation maps to 499 while the connection remains open. Configuration, protocol, non-HTTP, and application errors are rethrown for NestJS to handle normally.

The module keeps the existing `PID_CONTROLLER` and `PID_CONTROLLER_OPTIONS` tokens. Both `OnModuleDestroy` and `OnApplicationShutdown` call the host's idempotent `shutdown()` method; applications should enable NestJS shutdown hooks.
