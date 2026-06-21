# Mycelium Multi-Device Synchronizer Architecture

This document defines the DAOVibe Mycelium multi-device synchronizer architecture.
It is architecture only. It does not implement runtime sync behavior, cloud sync,
peer discovery, a mobile app, desktop packaging, server routes, or native code.

## Boundary Rule

Mycelium uses one protocol core across multiple device shells.

The packet ledger remains the source of truth. Devices synchronize changes,
deltas, and events; they must not repeatedly transmit unchanged state. When two
devices receive the same valid packets, they must derive the same Mycelium state.

TypeScript may define boundaries, documentation, interfaces, advisory stubs, and
app glue. Critical enforcement should eventually live behind Rust, WASM, or
native Mycelium boundaries, not loose TypeScript controllers.

## Device Classes

### Phone Nodes

Phone nodes are lightweight mobile peer nodes. They are battery-aware,
bounded-storage, app-store-safe, offline-capable, and able to participate as
peers.

Phone nodes should prefer local phrase observation, lightweight meaning and
correction participation, identity interaction, settings interaction, and bounded
packet delta exchange. They should avoid heavy reconciliation, large ledger
scans, long-running indexing, and sustained background work unless the user or a
future policy explicitly allows it.

### Laptop And Desktop Nodes

Laptop and desktop nodes are heavier compute, storage, validation,
reconciliation, and diagnostics nodes. They are preferred for indexing,
diagnostics, ledger export/import, bulk validation, sync reconciliation, and
future native-boundary enforcement.

Laptop and desktop shells still use the same Mycelium protocol core as phones.
They may take on heavier responsibilities, but they do not become a separate
source of truth.

## Core Synchronization Rule

- Packet ledger remains source of truth.
- Only changes, deltas, and events sync.
- Repeated unchanged state transmission is out of bounds.
- Same valid packets must derive the same state on every device.
- One protocol core serves multiple device shells.

## Synchronizers

All synchronizers have runtime status `architecture_only`.

### Packet Synchronizer

- Purpose: move valid packet ledger changes between device shells.
- Source of truth: Mycelium packet ledger.
- May sync: new valid packets, packet cursors, packet delta manifests, packet
  integrity summaries.
- Must not sync: repeated unchanged packet state, derived state as packet truth,
  invalid packet blobs, transport secrets, private keys.
- Preferred device class: laptop/desktop for heavier validation and
  reconciliation.
- Phone constraints: bounded packet windows, no routine full-ledger scans, defer
  heavy reconciliation unless explicitly allowed.
- Laptop/desktop responsibilities: larger validation windows, packet indexes,
  ledger export/import preparation, packet gap reconciliation.
- Future native boundary: packet validation, hash verification, replay
  protection, delta integrity, and ledger admission.

### Phrase Synchronizer

- Purpose: keep phrase observations aligned as packet-derived changes.
- Source of truth: phrase observation packets.
- May sync: phrase observation packet deltas, phrase index update events, phrase
  cursors.
- Must not sync: repeated unchanged phrase indexes, raw private audio, capture
  buffers, phrase state not backed by valid packets.
- Preferred device class: any.
- Phone constraints: bounded local indexes and no background reindexing of large
  ledgers.
- Laptop/desktop responsibilities: larger phrase indexes and phrase diagnostics.
- Future native boundary: deterministic phrase-index derivation and large-index
  verification.

### Meaning Synchronizer

- Purpose: synchronize meaning proposals and votes so devices converge from the
  same packets.
- Source of truth: meaning proposal and vote packets.
- May sync: meaning proposal deltas, meaning vote deltas, reproducible
  derivation checkpoints.
- Must not sync: repeated unchanged meaning state, unverifiable summaries, model
  weights, private inference artifacts.
- Preferred device class: any.
- Phone constraints: bounded proposal and vote windows; avoid heavyweight
  meaning reconciliation unless explicitly allowed.
- Laptop/desktop responsibilities: bulk meaning validation and derived-state
  comparison.
- Future native boundary: meaning reduction, vote validation, and deterministic
  conflict handling.

### Correction Synchronizer

- Purpose: synchronize correction proposals and votes without treating advisory
  controller state as truth.
- Source of truth: correction proposal and vote packets.
- May sync: correction proposal deltas, correction vote deltas, correction
  maturity events derived from valid packets.
- Must not sync: manual correction state not backed by packets, cleanup commands,
  private moderator notes, repeated unchanged correction views.
- Preferred device class: any.
- Phone constraints: lightweight participation; no bulk correction-history
  reconciliation unless explicitly allowed.
- Laptop/desktop responsibilities: correction-history diagnostics and maturity
  validation across larger packet windows.
- Future native boundary: correction admission, vote thresholds, maturity
  scoring, and conflict reconciliation.

### Tombstone Synchronizer

- Purpose: synchronize tombstone proposals and votes without destructive
  execution in TypeScript sync controllers.
- Source of truth: tombstone proposal and vote packets.
- May sync: tombstone proposal deltas, tombstone vote deltas, non-destructive
  tombstone preview events.
- Must not sync: delete commands, ledger pruning commands, destructive tombstone
  execution, unrelated packet payloads.
- Preferred device class: laptop/desktop.
- Phone constraints: bounded tombstone display and voting; no destructive
  execution; no full-ledger tombstone scans unless explicitly allowed.
- Laptop/desktop responsibilities: tombstone diagnostics, maturity checks, and
  auditable previews.
- Future native boundary: irreversible tombstone execution, pruning guards,
  authorization, and deletion-adjacent enforcement.

### Identity Synchronizer

- Purpose: synchronize safe Mycelium identity metadata without leaking private
  device or key material.
- Source of truth: identity packets or explicitly ledger-bound identity metadata.
- May sync: public node identity metadata, packetized identity rotation events,
  safe capability declarations.
- Must not sync: private keys, device secrets, raw contact lists, account tokens,
  unbounded device fingerprints.
- Preferred device class: phone.
- Phone constraints: app-store-safe identity sync and private material kept local
  or in native secure storage.
- Laptop/desktop responsibilities: validate public identity history and assist
  diagnostics without owning private keys.
- Future native boundary: signature verification, identity rotation rules,
  secure key access, and private-material isolation.

### Settings Synchronizer

- Purpose: define how explicit Mycelium settings changes may sync while
  preserving local-only preferences.
- Source of truth: explicit settings events when packetized; otherwise local
  device settings remain local.
- May sync: user-approved Mycelium preference changes, settings cursors, safe
  capability preferences.
- Must not sync: credentials, platform privacy settings, battery policy
  overrides, local-only debug flags unless explicitly packetized.
- Preferred device class: phone.
- Phone constraints: respect mobile battery and privacy controls; do not override
  local platform settings through sync.
- Laptop/desktop responsibilities: validate settings-event history and diagnose
  drift without forcing local changes.
- Future native boundary: policy-gated settings admission, capability checks, and
  secure-setting boundaries.

### Diagnostics Synchronizer

- Purpose: synchronize bounded diagnostic events that explain sync health without
  changing packet truth.
- Source of truth: local diagnostic observations plus reproducible packet-ledger
  summaries.
- May sync: bounded health summaries, packet gap reports, reproducible ledger
  statistics, version and capability summaries.
- Must not sync: private packet contents, raw logs with secrets, continuous
  telemetry streams, cloud diagnostics.
- Preferred device class: laptop/desktop.
- Phone constraints: bounded diagnostics, user-visible where possible, and no
  continuous background telemetry.
- Laptop/desktop responsibilities: deeper diagnostics, packet-window comparison,
  derived-state summaries, human-readable sync reports.
- Future native boundary: sensitive diagnostic redaction, signed local
  attestations, and integrity proofs.

### Ledger Portability Synchronizer

- Purpose: define portable import/export boundaries for packet ledgers without
  cloud backup or desktop packaging.
- Source of truth: valid Mycelium packet ledger export/import material.
- May sync: ledger export manifests, valid packet bundles, import cursors,
  integrity summaries.
- Must not sync: derived caches as source of truth, invalid packet bundles,
  credentials, cloud backup artifacts, application installation packages.
- Preferred device class: laptop/desktop.
- Phone constraints: no bulk import/export unless explicitly allowed; prefer
  bounded previews and respect storage and battery limits.
- Laptop/desktop responsibilities: prepare exports, validate imports, run bulk
  packet integrity checks, and support future native portability enforcement.
- Future native boundary: export/import validation, manifest verification, schema
  checks, and bulk packet integrity enforcement.

## Out Of Scope

This architecture does not include EEE, SBP, marketplace, Student Nodes, cloud
sync, peer discovery, mobile app implementation, desktop packaging, server route
changes, or runtime behavior changes.
