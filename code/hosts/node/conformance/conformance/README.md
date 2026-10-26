# Conformance scenarios

This directory is the language-neutral behavioral contract for Adaptive Admission Controller.
Version 1 scenarios are JSON arrays validated by [`schema.json`](schema.json). Each scenario creates
one independent controller and applies an ordered trace of operations and observations.

## Rules

- Fields use the lower-camel-case spelling generated from the WIT interface.
- Time is a host-supplied monotonic `u64` value in milliseconds.
- Priorities are raw values in `0..=767`; lower values are more important.
- A successful submission assigns an alias with `as`. Later lifecycle operations and expected
  actions use that alias so normal traces do not depend on a language-specific request-ID
  representation. Error scenarios may use the raw fixed-width ID carried by the WIT error payload.
- Every mutating operation declares either `actions` or `error`, never both. Action order is part of
  the contract.
- Missing configuration fields take the defaults exported by the core.
- Floating-point snapshot values are compared with a small representation tolerance. Persistent
  controller state must still contain only finite values.

The Rust runner is in
[`crates/adaptive-admission-core/tests/conformance.rs`](../crates/adaptive-admission-core/tests/conformance.rs).
Run it with:

```bash
cargo test -p adaptive-admission-core --test conformance
```

An adapter or implementation in another language can certify its state-machine boundary by reading
the same files, mapping each operation to its public API, and comparing the resulting actions and
observations. Host task execution, promises, framework requests, and timers are intentionally absent
from these traces.

## Scenario groups

- `admission.json`: threshold, queue capacity, input, and configuration validation.
- `scheduling.json`: concurrency, priority ordering, FIFO, completion, and failure.
- `lifecycle.json`: cancellation and shutdown.
- `deadlines.json`: inclusive expiration and monotonic time.
- `statistics.json`: execution windows and published snapshots.
- `pid.json`: feedback-driven admission thresholds.
- `adaptive-timeout.json`: statistics-driven queue deadlines.
- `automatic-tuning.json`: concurrency tuning and immediate queue draining.

JSON cannot encode non-finite numbers. Rust-native tests continue to cover `NaN`, infinity, integer
overflow, and implementation-specific type limits.
