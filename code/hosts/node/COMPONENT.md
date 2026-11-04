# Embedded stable component

The npm package embeds a WebAssembly component built from an exact crates.io dependency. Installing
or using the package does not require Cargo or a Rust toolchain.

| Field | Value |
| --- | --- |
| Registry | `https://crates.io` |
| Crate | `adaptive-admission-core` |
| Crate version | `0.1.0` |
| Crate owner | `jfrz38` |
| Crate checksum | `823b1ca077228a3fd229aad05e958e585663072571f0f7709bdbfb70f28dab90` |
| Upstream repository | `https://github.com/jfrz38/adaptive-admission-controller` |
| Upstream commit | `b821533645e6dfbfb611b9459345d0e5030bf83a` |
| WIT world | `jfrz38:adaptive-admission/adaptive-admission@0.1.0` |
| Rust | `rustc 1.99.0 (b940084d7 2026-09-28)` |
| Cargo | `cargo 1.99.0 (5f94df478 2026-08-27)` |
| wasm-tools | `1.262.0` |
| wit-bindgen | `0.63.0` |
| jco-transpile | `0.20.0` |

The resulting component SHA-256 is:

```text
cbb610c98d9a53efa04379bfc9cb21bd8acbcfe9680c3f052daa4082e496fd6a
```

`component/COMPONENT.json` relates the crate, build manifest, upstream release manifest, WIT,
conformance suite, toolchain, and generated artifact. Host generation fails before transpilation if
any checksum or required contract operation differs. `make verify-node-component` additionally
rebuilds the component and requires byte-for-byte equality with the npm artifact.

## Updating the component

1. Confirm the new `adaptive-admission-core` version, owner, checksum, release commit, and WIT.
2. Set an exact `=X.Y.Z` dependency in `component-build/Cargo.toml` and update the WIT package
   version when required.
3. Run `cargo update --manifest-path code/hosts/node/component-build/Cargo.toml -p
   adaptive-admission-core --precise X.Y.Z` so Cargo records the registry checksum.
4. Build with the pinned Rust and wasm-tools versions, validate the component, and replace the
   versioned artifact under `component/`.
5. Update `adaptive-admission-build-vX.Y.Z.json`, `COMPONENT.json`, `SHA256SUMS`, and this document.
6. Run `make verify-node-component`, `make validate-node`, and `make test-consumer-packages`.

There is no fallback to a Git branch. A rollback repeats this procedure with a previously published
exact crate version and produces a new npm package release; mutable Git references are never used as
the component source.

## Retiring the TypeScript package

After Node `0.1.0`, Express `0.2.0`, and NestJS `0.2.0` are published successfully from `main`, the
old package can be marked deprecated without deleting its existing versions:

```bash
npm deprecate '@jfrz38/pid-controller-core@*' \
  'Deprecated: use @jfrz38/adaptive-admission-node or the Express/NestJS adapters.'
```
