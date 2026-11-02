# Embedded migration snapshot

This branch embeds a component built from the immutable source below:

| Field | Value |
| --- | --- |
| Repository | `https://github.com/jfrz38/adaptive-admission-controller` |
| Informational branch | `main` |
| Commit | `b821533645e6dfbfb611b9459345d0e5030bf83a` |
| Component version | `0.1.0` |
| WIT world | `jfrz38:adaptive-admission/adaptive-admission@0.1.0` |
| Rust | `rustc 1.99.0 (b940084d7 2026-09-28)` |
| wasm-tools | `1.262.0` |
| jco-transpile | `0.20.0` |

The checkout was clean and detached at the exact commit before running `make dist`. The resulting
component SHA-256 is:

```text
f15826063850c2963a64481695f8550d295dd776e871de439b2d74c0de9bb7a5
```

`component/COMPONENT.json` relates the source, toolchain, WIT, conformance archive, upstream
manifest, generated artifact, and their checksums. Generation fails before transpilation when any
checksum or required contract operation differs.

This is a `git-snapshot` with `publishable: false`. Normal `pnpm pack`, release, and npm publication
are blocked. The package smoke test uses an explicit local override solely to inspect and install a
tarball outside the workspace. Stable publication remains disabled until the component is sourced
from the exact crates.io version required by migration iteration 3.
