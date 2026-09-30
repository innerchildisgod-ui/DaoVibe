# Mycelium v0.1 Alpha artifact inventory

Expected local outputs after the required verification commands:

| Artifact | Expected path or location |
| --- | --- |
| Android debug APK | `apps/daovibe-android/app/build/outputs/apk/debug/app-debug.apk` |
| Rust debug binary | `apps/daovibe-desktop-node/target/debug/daovibe-desktop.exe` |
| Optional Rust release binary | `apps/daovibe-desktop-node/target/release/daovibe-desktop.exe` after an explicit `cargo build --release` |
| Release contract | `docs/mycelium-v0.1-alpha.md` |
| Physical acceptance | `docs/mycelium-v0.1-physical-acceptance.md` |
| Operator guide | `docs/mycelium-v0.1-operator-guide.md` |
| Recovery drill | `docs/mycelium-v0.1-recovery-drill.md` |
| This inventory | `docs/mycelium-v0.1-artifacts.md` |
| Android compatibility fixtures | `apps/daovibe-android/app/src/test/resources/fixtures/` |
| Shared protocol fixtures | `protocol-fixtures/` |

APK/EXE outputs are build artifacts, not Git files. The Rust schema is the
existing idempotent SQLite layout; Android Room is schema version 7. The four
semantic fingerprint fixtures and the peer invite bytes/ID are recorded in the
release contract and must be checked before release.

## Deterministic release-blocker model

The Rust `release::evaluate_alpha_release` model is the machine-readable
checklist vocabulary used by the release tests and this documentation.

Blockers are `pass` or `fail`: build failure, test failure, consistency
failure, fingerprint compatibility regression, invite compatibility regression,
migration/schema incompatibility, and privacy leak in diagnostics. Scope
warnings are explicit `warning` entries: no cryptographic auth, manual peer
configuration, no discovery, and development pairing only. A warning is not a
security approval; the alpha is never described as secure.

