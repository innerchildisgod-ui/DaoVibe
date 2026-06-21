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

## Future phases
1. Freeze TypeScript interfaces.
2. Build Rust/WASM proof for packet hashing and validation.
3. Replace TypeScript validation behind the same interface.
4. Add packet signing and verification.
5. Move deterministic governance ranking if needed.
6. Add native encryption/private-packet module later.
