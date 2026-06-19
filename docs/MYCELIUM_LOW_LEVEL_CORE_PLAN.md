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

## Future phases
1. Freeze TypeScript interfaces.
2. Build Rust/WASM proof for packet hashing and validation.
3. Replace TypeScript validation behind the same interface.
4. Add packet signing and verification.
5. Move deterministic governance ranking if needed.
6. Add native encryption/private-packet module later.
