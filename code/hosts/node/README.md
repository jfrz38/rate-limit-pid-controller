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

Operational tools can subscribe to low-volume controller diagnostics without affecting admission:

```ts
const unsubscribe = controller.onDiagnostic((event) => {
  // threshold-changed, concurrency-changed, or statistics-published
  console.log(event);
});

unsubscribe();
```

Listeners run after the component mutation that produced the event. They are intended for
observability and simulations, not for admission decisions.

The package is ESM-only. Each `AdaptiveAdmissionController` owns independent queue, PID, statistics,
and timer state. Limits are not coordinated across workers or processes.
