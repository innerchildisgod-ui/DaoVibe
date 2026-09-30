# NEXT TASK

## Mycelium v0.1 Alpha Acceptance & Release Readiness

Implement the currently approved Mycelium milestone:

- prepare the existing Mycelium implementation for a small v0.1 alpha release
- define the v0.1 alpha release contract and known limitations
- add release/version metadata only where safe
- add/reuse privacy-safe release diagnostics
- create the manual physical acceptance checklist
- create the operator/debug guide
- create the non-destructive recovery drill
- create the release artifact inventory
- add high-level alpha acceptance tests where cleanly possible
- add a deterministic release-blocker model
- preserve all existing Mycelium protocol and semantic behavior
- preserve all four canonical fingerprints and peer invite compatibility values
- keep Android Room v7 unless a release-blocking issue proves otherwise
- do not modify the pre-existing apps/daovibe-android/build.gradle.kts working-tree change
- no cryptographic identity/authenticated transport implementation yet
- no DHT, gossip, NAT traversal, Bluetooth, Wi-Fi Direct, hotspot mesh
- no Compute/WASM, People-Owned Cloud, EEE, SBP, speech, orchestrators, or service modules
- no physical-device testing in Codex
- no firewall changes
- no commit, push, or tag

The full implementation and verification requirements are supplied in:

C:\Users\ADMIN\Downloads\mycelium_v01_alpha_acceptance_release_readiness_prompt.txt

At the end, update NEXT_TASK.md so the next recommended milestone is:

Mycelium v0.2 — Cryptographic Identity & Authenticated Transport Design

PLAN ONLY for v0.2. Do not implement it in this run. The plan should cover
asymmetric node identity, signed packets, authenticated peer handshake,
encrypted transport, key persistence/recovery design, migration compatibility,
and a threat model.

STOP after the v0.1 Alpha Acceptance & Release Readiness milestone.

## Next recommended milestone

Mycelium v0.2 — Cryptographic Identity & Authenticated Transport Design

Plan only: asymmetric node identity, signed packets, authenticated peer
handshake, encrypted transport, key persistence/recovery design, migration
compatibility, and threat model. Do not implement this milestone here.
