# Mycelium Multi-Device Sync

## Principle

DAOVibe uses one protocol core across many device shells.

Mycelium nodes may run on:
- phones
- laptops
- desktops
- tablets
- future local nodes

These devices are peers, but they do not need identical responsibilities.

Phones participate as real nodes.
Laptops/desktops act as heavier compute, storage, validation, diagnostics, export/import, and reconciliation nodes.
When devices share the same valid packets, they must derive the same Mycelium state.

Phones should not be forced into heavy background computation.
Phone work should be bounded, local-first, user-visible where possible, and sync-efficient.

## Device Roles

### Phone Node

Phone nodes should be optimized for:
- mobile identity
- local phrase observation
- mic/voice interaction later
- lightweight meaning proposals
- correction/vote participation
- local cache
- nearby sync
- user-visible actions
- bounded computation

Phone nodes should avoid:
- heavy background computation
- large ledger scans
- long-running indexing
- bulk reconciliation when a laptop/desktop node is available
- unnecessary battery/radio usage

### Laptop/Desktop Node

Laptop/desktop nodes should be optimized for:
- heavier packet validation
- larger local ledger storage
- packet tracing
- diagnostics
- ledger export/import
- bulk reconciliation
- local indexing
- future Rust/WASM native-core execution
- future model/audio processing where appropriate

## Synchronistic Rule

Devices may temporarily have different packet histories.

But if two devices receive the same valid packets, they must derive the same Mycelium state.

Same packets -> same derived state.

## Synchronizer Model

Use focused synchronizers instead of one giant syncer.

Initial synchronizer boundaries:
- PacketSynchronizer
- PhraseSynchronizer
- MeaningSynchronizer
- CorrectionSynchronizer
- TombstoneSynchronizer
- IdentitySynchronizer
- SettingsSynchronizer
- DiagnosticsSynchronizer
- LedgerPortabilitySynchronizer

Future synchronizer boundaries:
- VoiceModelSynchronizer
- MediaSynchronizer
- FederatedLearningDeltaSynchronizer
- MarketplaceSynchronizer
- ValueExchangeSynchronizer

## Sync Rules

- Local-first.
- Offline-capable.
- Cursor/delta/event based.
- Do not repeatedly transmit unchanged state.
- Prefer signed/validated packets when real crypto is added.
- Avoid heavy gossip.
- Prefer nearby/zone sync when available.
- Laptops/desktops may perform heavier reconciliation.
- Phones should do bounded work and defer heavy tasks when possible.

## Non-Goals For Current Mycelium

This document does not implement:
- phone app
- desktop packaging
- peer discovery
- cloud sync
- encrypted backup
- SBP
- EEE
- marketplace
- Student Nodes
