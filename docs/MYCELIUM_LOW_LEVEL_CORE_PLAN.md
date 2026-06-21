# Mycelium Low-Level Core Plan

## Principle
Low-level code is for correctness, security, performance, and tamper resistance.
TypeScript remains for app UI, route wiring, and fast product iteration.

## Keep in TypeScript for now
- app UI
- forms
- route wiring
- controller orchestration
- API client wrapper
- docs/dev tooling
- early product iteration

## Move to Rust first
- packet validation
- canonical packet serialization
- packet hashing
- payload hashing
- packet signature verification
- node identity signing keys
- ledger verification
- duplicate packet detection
- correction/tombstone deterministic ranking
- sync conflict resolution
- packet size estimation
- private packet encryption/decryption later

## Why Rust
- memory safety
- high performance
- strong type system
- good WASM support
- good cryptography ecosystem
- easier native/WASM boundary than C++ for this project

## Possible WASM boundary
- validatePacket(packet)
- canonicalizePacket(packet)
- hashPayload(payload)
- verifyPacketSignature(packet)
- rankCorrectionCandidates(input)
- summarizeTombstones(input)
- verifyLedgerSlice(packets)

## Possible native Node boundary
- use Rust compiled as native Node addon later only if WASM is too slow
- prefer WASM first for portability

## Native Core Boundary
The first native-core boundary is defined in:

`src/kernel/NativeCoreBoundary.ts`

This is a TypeScript interface only. It does not add Rust/WASM implementation yet.

Future Rust/WASM candidates:
- packet canonicalization
- payload hashing
- packet hashing
- packet validation
- signature verification
- ledger slice verification
- deterministic correction/tombstone ranking if needed
- sync conflict resolution
- encryption/decryption later

Keep in TypeScript:
- app UI
- Express routes
- local settings
- diagnostics
- API client wrapper
- app panels
- docs/dev tooling
- orchestration glue until behavior stabilizes

Preferred future path:
Rust -> WASM first for portability.
Native Node addon only if WASM is too slow.
C/C++ only for specific native libraries, speech/audio engines, or hardware integrations.

## Orchestrators and Native Core

Protocol-critical orchestrator enforcement should eventually live in Rust/WASM where deterministic behavior, memory safety, and tamper resistance matter.

Future low-level candidates:
- Dori for memory/store/seed/lifecycle enforcement
- Maxwell's Demon for packet admission and signal/noise filtering
- Alan Turing for protocol verification
- (π)enz for scoring, maturity, ratios, and thresholds
- Mangoose for malicious packet/threat response
- Death for lifecycle ending and tombstone execution review

TypeScript may keep:
- symbolic naming
- app display
- docs
- route orchestration
- advisory stubs
- non-critical UX/reporting behavior

## Avoid for now
- rewriting the UI in Rust
- rewriting Express/server routes in Rust
- adding C/C++ unless there is a very specific hardware/native need
- premature cryptographic complexity before packet signing design is ready

## SQLite Migration Boundary
SQLite migration orchestration stays TypeScript for now.
Future low-level Rust/WASM work should target packet validation, hashing, signing, canonicalization, ledger verification, ranking, and cryptography first.
Database schema migration coordination should remain in the app/server layer unless a native storage engine is introduced later.

## Local Settings Boundary
Local settings and config stay in the TypeScript/server layer.
Do not move settings to Rust/WASM.
Rust/WASM work should remain focused on packet validation, hashing, signing, canonicalization, ledger verification, ranking, sync conflict resolution, and cryptography.

## Diagnostics Boundary
Diagnostics route, local settings, app panels, API version display, and server health reporting stay TypeScript/server/app-layer.
They should not move to Rust/WASM unless a future native node runtime replaces the server shell.

Rust/WASM should remain reserved for protocol-critical work:
- packet validation
- canonical serialization
- payload hashing
- packet hashing
- packet signing
- signature verification
- ledger verification
- duplicate detection
- deterministic correction/tombstone ranking
- sync conflict resolution
- encryption/decryption
- private packet handling

TypeScript may store and display diagnostics. Future Rust/WASM may produce low-level verification results, and the app can display those results later, but the app should not own protocol truth.

## Multi-Device Native Core Direction

Mycelium must run across phones, laptops, desktops, tablets, and future local nodes.

Rust/WASM should eventually provide shared deterministic protocol behavior across device shells.

Phones should run bounded, battery-aware protocol work.

Laptops/desktops should be preferred for heavier validation, indexing, diagnostics, ledger portability, and reconciliation work.

The target is:

One protocol core.  
Multiple device shells.  
Same valid packets -> same derived state.

## Future phases
1. Freeze TypeScript interfaces.
2. Build Rust/WASM proof for packet hashing and validation.
3. Replace TypeScript validation behind the same interface.
4. Add packet signing and verification.
5. Move deterministic governance ranking if needed.
6. Add native encryption/private-packet module later.
