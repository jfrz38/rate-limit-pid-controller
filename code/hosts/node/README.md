# Adaptive Admission Controller for Node.js

ESM-only Node.js host for the portable
[`adaptive-admission-controller`](https://github.com/jfrz38/adaptive-admission-controller)
WebAssembly component. Node.js 24 or newer is required.

The component owns admission, priority queueing, concurrency, statistics, PID feedback, adaptive
timeouts, and automatic tuning. This package owns JavaScript tasks, promises, monotonic time, and
the timer that drives component deadlines.

The embedded component is built reproducibly from the exact crates.io dependency recorded in
[COMPONENT.md](./COMPONENT.md).

## Installation

```bash
pnpm add @jfrz38/adaptive-admission-node
```

The package is ESM-only:

```ts
import { AdaptiveAdmissionController, Priority } from '@jfrz38/adaptive-admission-node';
```

CommonJS `require()` is not supported.

## Execute work

```ts
const controller = new AdaptiveAdmissionController();

try {
  const result = await controller.run(
    async () => performWork(),
    Priority.fromTier(1, 0),
  );
  console.log(result);
} finally {
  controller.shutdown();
}
```

Synchronous return values and promises are supported. If the task throws or rejects, its original
error is preserved after the component records the failed outcome.

## Priorities

Priorities range from `0` (most important) to `767` (least important). Work waiting for capacity is
ordered by priority and FIFO within the same priority.

```ts
Priority.fromValue(10);
Priority.fromTier(2, 42); // Six tiers, each with 128 cohorts.
Priority.default();      // Tier 5 with a random cohort.
```

## Cancellation

Pass an `AbortSignal` as a run option:

```ts
const abortController = new AbortController();
const result = controller.run(
  () => performWork(),
  Priority.fromValue(100),
  { signal: abortController.signal },
);

abortController.abort();
await result;
```

An already-aborted signal prevents submission. Aborting queued work removes it from the component
queue and rejects with `CancelledRequestError`. JavaScript work that has already started cannot be
interrupted by the controller and is allowed to finish.

## Configuration

Omitted values use the defaults defined by the pinned Rust component.

| Option | Default | Purpose |
| --- | ---: | --- |
| `initialThreshold` | `768` | Initial admission boundary; priorities below it are admitted. |
| `maxConcurrentRequests` | `10` | Initial number of tasks allowed to run concurrently. |
| `maxQueuedRequests` | `1000` | Maximum number of tasks waiting for capacity. |
| `queueTimeoutMs` | `500` | Initial queue deadline in milliseconds. |
| `queueTimeoutRatio` | `0.33` | Ratio used to adapt queue deadlines from observed latency. |
| `statistics.minWindowMs` | `2000` | Minimum statistics window duration. |
| `statistics.maxWindowMs` | `30000` | Maximum statistics window duration. |
| `statistics.minSamples` | `250` | Successful samples needed to close a ready window. |
| `statistics.minPercentileSamples` | `250` | Priority samples needed for percentile decisions. |
| `statistics.maxSamples` | `1000` | Maximum samples retained per window. |
| `statistics.latencyPercentile` | `90` | Latency percentile used by adaptive control. |
| `pid.proportionalGain` | `0.2` | PID proportional gain. |
| `pid.integralGain` | `0.5` | PID integral gain. |
| `pid.derivativeGain` | `0` | PID derivative gain. |
| `pid.intervalMs` | `500` | PID evaluation interval. |
| `pid.maxDeltaPercentage` | `10` | Maximum threshold change per PID update. |
| `pid.integralDecay` | `0.5` | Decay applied to accumulated integral error. |

Integer fields represented as WIT `u64` accept a safe JavaScript integer or `bigint`. Invalid host
values throw `RangeError`; values rejected by the component throw `ConfigurationError`.

## Errors

| Error | Meaning |
| --- | --- |
| `AdmissionRequestError` | Base class for request rejection, eviction, cancellation, and shutdown errors. |
| `ThresholdRejectedError` | Priority was outside the current admission threshold. |
| `QueueFullError` | The bounded waiting queue was full. |
| `EvictedRequestError` | Queued work exceeded its deadline. |
| `CancelledRequestError` | Queued work was explicitly cancelled. |
| `ControllerShutdownError` | Work was queued or submitted after shutdown. |
| `ConfigurationError` | Rust rejected the supplied configuration. |
| `ControllerProtocolError` | The component detected an invalid lifecycle transition. |

All package errors extend `AdaptiveAdmissionError`. Request lifecycle errors extend
`AdmissionRequestError`; configuration and protocol failures do not. Errors thrown by the user's
task remain distinct and are preserved unchanged.

## Lifecycle and shutdown

Each controller owns independent queue, PID, statistics, and timer state. Call `shutdown()` during
service teardown. It is idempotent, rejects new work, cancels queued work, clears unnecessary
deadlines, and allows already-started JavaScript tasks to finish.

One controller limits only its current Node.js process or worker. Instances do not coordinate
limits across workers, processes, containers, or hosts.

## Diagnostics

Operational tools can subscribe to low-volume events:

```ts
const unsubscribe = controller.onDiagnostic((event) => {
  console.log(event);
});

unsubscribe();
```

Events include `threshold-changed`, `concurrency-changed`, `statistics-published`, and
`controller-diagnostics`. Listener failures are isolated and cannot change admission decisions or
task outcomes. Diagnostics are intended for observability and simulations, not admission logic.

`latestStatistics()` returns the latest completed statistics window, while
`priorityPercentile(percentile)` queries recently observed priorities.

## Component provenance

Builds read `component/COMPONENT.json`, validate every artifact checksum, compare the embedded WIT
export with the checked-in contract, and verify both upstream release and local build provenance
before transpilation. `make verify-node-component` rebuilds the committed artifact from the exact
crates.io package, locked transitive dependencies, and pinned toolchain. Generated JavaScript and
WebAssembly modules are included in the npm tarball, so consumers do not need Cargo or Rust.
