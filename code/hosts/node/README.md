# Adaptive Admission Controller for Node.js

Node.js host SDK for the portable
[`adaptive-admission-controller`](https://github.com/jfrz38/adaptive-admission-controller)
WebAssembly component.

The WebAssembly component owns admission, priority queueing, concurrency, statistics, PID feedback,
adaptive timeouts, and automatic tuning. This package owns Node tasks, promises, a monotonic clock,
and the timer that drives component deadlines.

## Usage

```ts
import { AdaptiveAdmissionController, Priority } from '@jfrz38/adaptive-admission-node';

const controller = new AdaptiveAdmissionController();

const result = await controller.run(
  async () => performWork(),
  Priority.fromTier(1, 0),
);

controller.shutdown();
```

The package is ESM-only. Each `AdaptiveAdmissionController` owns independent queue, PID, statistics,
and timer state. Limits are not coordinated across workers or processes.
