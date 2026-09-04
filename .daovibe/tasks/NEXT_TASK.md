# DAOVibe Task

## Goal

Add debug-only JSON export/import for the Android local packet ledger.

This is preparation for testing packet movement before real networking exists.

## Context

The Android Mycelium core already has:
- Room packet ledger
- packet validation
- TypeScript-compatible hashing
- deterministic replay
- rebuildDerivedStateFromLedger()
- passing JVM tests

The packet ledger remains the source of truth.

## Scope

Work only inside:

apps/daovibe-android/

Implement a small debug/local API that can:

1. Export the local packet ledger to JSON.
2. Import packet-ledger JSON.
3. Decode packets using the existing PacketJsonCodec.
4. Validate every imported packet.
5. Reject invalid or expired packets.
6. Avoid duplicate packet insertion.
7. Import atomically where practical.
8. Rebuild derived Mycelium state from the ledger after successful import.

No network transport yet.

## Do Not Touch

Do not implement:
- HTTP sync
- P2P
- peer discovery
- DHT
- gossip
- EEE
- SBP
- KYC
- payments
- compute
- orchestrators
- real cryptography

Do not modify the old TypeScript implementation.

Do not change existing hashing/canonicalization behavior unless a failing compatibility test proves a bug.

## Required Tests

Add tests proving:

- exporting then importing preserves packets
- invalid packet causes import failure
- failed import does not leave partial state
- duplicate packets remain single ledger entries
- imported ledger rebuilds expected derived state
- export/import/export is deterministic
- two independent Room databases importing the same JSON derive equal state

## Required Build Checks

Run:

.\gradlew.bat testDebugUnitTest --no-daemon

and:

.\gradlew.bat assembleDebug --no-daemon

from apps/daovibe-android.

## Completion Criteria

- JSON ledger export works
- JSON ledger import works
- validation path is reused
- packet history remains source of truth
- derived state rebuilds correctly
- tests pass
- debug build passes

## Stop Condition

STOP after local JSON import/export works.

Do not continue into networking.
