# Mycelium v0.1 Alpha release contract

This is a small, local-first alpha release of the existing Mycelium/core
implementation. The release name is `v0.1-alpha` (Android version name
`0.1-alpha`; Rust package/CLI version `0.1.0-alpha`). It is intentionally a
development and acceptance milestone, not a security claim.

## What this alpha is

- A local-first Mycelium semantic packet ledger.
- An Android light node and a Rust desktop/heavy node.
- Immutable local node identity and deterministic semantic replay.
- Manual peer configuration and bounded packet sync.
- Development pairing correlation and invite compatibility fixtures.
- Canonical export/import, deterministic state fingerprints, and read-only
  consistency/replay diagnostics.
- A local alpha-readiness check with privacy-bounded copied diagnostics.

The packet ledger remains the source of truth. Valid packets in the same
canonical order derive the same state and fingerprint. Peer health, cursors,
and Diagnose metadata are operational metadata and are excluded from semantic
state.

## What this alpha is not

- Not cryptographic authentication, signed identity, or proof-of-possession.
- Not an encrypted transport guarantee, secure key exchange, or MITM-resistant
  channel.
- Not DHT, gossip discovery, NAT traversal, Bluetooth, Wi-Fi Direct, or hotspot
  mesh networking.
- Not anonymous identity, distributed cloud storage, or a cloud replacement.
- Not a compute/WASM runtime, EEE, SBP, orchestrator, or service-module release.
- Not production security certification or a production deployment guarantee.

Pairing and invites are development correlation only. They must not be described
as secure credentials. Physical-device acceptance is a human-run follow-up and
was not performed by Codex.

## Compatibility contract

The following values are release fixtures and must remain exact:

| Fixture | Value |
| --- | --- |
| convergence fingerprint | `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0` |
| canonicalization edge fingerprint | `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab` |
| correction fingerprint | `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f` |
| correction tombstone fingerprint | `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52` |
| peer invite canonical bytes | `353` |
| peer invite ID | `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9` |

Room remains schema version 7. Rust uses the existing idempotent SQLite layout;
there is no new Rust schema migration in this milestone.

## Readiness and diagnostics

The existing read-only readiness checker proves structural identity, packet
revalidation, dependency-aware replay, canonical fingerprint, and an isolated
export/import round trip. Android diagnostics include package/version, node ID,
packet and peer counts, fingerprint, consistency/replay status, Room schema
version, and the last check time. Rust `mycelium-check` includes package
version, schema compatibility description, node ID, packet count, fingerprint,
status, issues, and performed checks.

Copied diagnostics exclude packet payload bodies, pairing secrets/PINs, invite
payloads, filesystem secrets, and raw exception text. A failed check reports a
bounded stable issue code only.

