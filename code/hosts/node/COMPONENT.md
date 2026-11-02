# Embedded development snapshot

This migration branch embeds a development build of the component from
`jfrz38/adaptive-admission-controller` `develop`, commit
`bd60746f3d00c85729b41cd409e8f2ee2eb1a1a1`.

It includes the read-only `latest-diagnostics` WIT operation. This is a development snapshot, not
a published GitHub Release or npm package. Its component package version remains `0.1.0`; the exact
source commit and artifact checksum are recorded in [`development/COMPONENT.json`](component/development/COMPONENT.json).

The component SHA-256 is:

```text
f15826063850c2963a64481695f8550d295dd776e871de439b2d74c0de9bb7a5
```

`@bytecodealliance/jco-transpile` 0.20.0 transpiles that component during the package build. The
generated JavaScript and core WebAssembly modules are shipped in `dist/generated`. The original
published `v0.1.0` assets remain in `component/` unchanged.
