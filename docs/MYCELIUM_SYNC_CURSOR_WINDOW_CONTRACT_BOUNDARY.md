# Mycelium Sync Cursor and Packet Window Contract Boundary

Commit 47 defines the Mycelium sync cursor and packet window contract boundary.

This document is architecture-only. It does not implement runtime sync, networking, storage, peer discovery, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Mycelium sync must stay delta-based.

Devices should not repeatedly send unchanged full state. They should resume from known positions, exchange bounded packet windows, repair missing packet gaps, and preserve deterministic derived state.

A cursor is only a resume boundary.

A packet window is only a bounded view over ledger events.

Neither one replaces the packet ledger as source of truth.

## Core rule

The packet ledger remains the source of truth.

Only changes, deltas, events, cursors, packet windows, tombstones, corrections, and compact summaries should move between devices.

Repeated unchanged derived state should not be transmitted.

Same valid packets should derive the same state on every device.

## Cursor role

A cursor helps a device say:

- what it has already seen
- where another sync pass should resume
- which packet window should be scanned next
- whether a gap may exist
- how to avoid resending unchanged state

A cursor must not become:

- a source of truth
- a cloud checkpoint
- a central-server requirement
- a replacement for packet validation
- an authority over ledger truth

## Packet window role

A packet window is a bounded set or range of ledger events.

Packet windows may support:

- packet deltas
- missing packet repair
- tombstone sync
- correction sync
- identity sync
- settings sync
- diagnostics summaries
- ledger portability review

Packet windows must remain bounded, verifiable, and tied to ledger truth.

## Phone constraints

Phones are real bounded Mycelium peer nodes, not thin clients.

Phones may consume bounded cursor windows, packet deltas, tombstone deltas, correction deltas, identity deltas, settings deltas, diagnostics summaries, and small portability windows.

Phones should avoid full ledger scans, unbounded repair, heavy diagnostics, and large export/import integrity review by default.

## Laptop/desktop responsibilities

Laptops and desktops are preferred for:

- larger packet-window review
- missing packet detection
- correction contest review
- tombstone audit
- identity consistency review
- settings conflict review
- diagnostics scans
- ledger portability integrity checks
- preparing phone-safe deltas

They are heavier peers, not central servers.

## Deterministic derived state

Same valid packets should derive the same state on every device.

If devices disagree, the disagreement should be explainable through:

- missing packets
- invalid packets
- cursor gaps
- tombstones
- correction state differences
- policy version mismatch
- deterministic derivation bugs

The fix should converge back to packet-ledger truth.

## Delta-only sync

Sync should prefer:

- packet deltas
- missing packet references
- tombstone deltas
- correction deltas
- identity deltas
- settings deltas
- cursor guidance
- compact diagnostics summaries
- bounded portability windows

Sync should avoid:

- repeated unchanged phrase state
- repeated unchanged meaning state
- repeated unchanged correction state
- repeated unchanged settings state
- full-state broadcast loops
- cloud-owned checkpoints

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation responsibilities.

Commit 47 defines the cursor/window contract that future synchronizers can use to avoid repeated unchanged state transmission.

## Future native boundary

Critical cursor and window validation should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce:

- cursor safety
- packet-window validation
- missing packet repair correctness
- tombstone window integrity
- correction window review
- deterministic replay safety
- phone-safe bounded windows
- ledger portability integrity

TypeScript defines the contract here. It does not enforce it.
