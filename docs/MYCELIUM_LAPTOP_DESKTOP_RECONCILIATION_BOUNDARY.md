# Mycelium Laptop/Desktop Reconciliation Boundary

Commit 46 defines the Mycelium laptop/desktop reconciliation boundary.

This document is architecture-only. It does not implement runtime sync, scheduling, peer discovery, server behavior, cloud sync, desktop packaging, or native enforcement.

## Why this boundary exists

Commit 45 bounded phone sync work.

This boundary defines the heavier work that laptops and desktops are preferred to perform in Mycelium.

Laptops/desktops can usually handle more storage, longer execution windows, larger packet windows, deeper diagnostics, index rebuilds, export/import review, and reconciliation checks.

That does not make them central servers.

They are heavier peers.

## Core rule

The packet ledger remains the source of truth.

Laptops/desktops may help review, validate, diagnose, rebuild, reconcile, export, import, and prepare bounded phone deltas.

They must not override valid packet-ledger truth with local preference.

## Laptops/desktops are not central authorities

A laptop or desktop should not become:

- a central packet authority
- a cloud replacement
- a mandatory server
- a single source of truth
- a reason to make phones thin clients
- a hidden owner of Mycelium state

The architecture remains local-first and peer-capable.

## Preferred laptop/desktop work

Laptops/desktops are preferred for:

- packet window review
- bulk packet validation
- phrase index rebuilds
- meaning index rebuilds
- contested correction review
- tombstone audits
- diagnostics scans
- derived state comparison
- ledger export review
- ledger import review
- portability integrity checks
- bounded phone delta preparation

## Phone relationship

Phones remain valid bounded peers.

Phones may hold local offline Mycelium state, accept bounded deltas, perform lightweight validation, queue outgoing events, and resume sync using cursors.

Laptops/desktops should help absorb heavy work and prepare phone-safe deltas.

This preserves phone participation without treating phones like unlimited servers.

## Deterministic state

Same valid packets should derive the same state on every device.

If two devices disagree, the reason should be explainable through:

- missing packets
- invalid packets
- different packet windows
- tombstones
- policy version mismatch
- deterministic derivation bug
- incomplete reconciliation

The solution should converge back to packet-ledger truth.

## Delta-only sync

Heavy reconciliation should not produce repeated full-state sync.

It should produce:

- missing packet deltas
- tombstone deltas
- correction deltas
- cursor guidance
- bounded repair summaries
- compact diagnostics
- phone-safe packet windows

Repeated unchanged state should not be transmitted.

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defines the heavier laptop/desktop reconciliation side of the same architecture.

## Future native boundary

Critical enforcement should eventually live behind Rust/WASM/native boundaries.

TypeScript can define architecture and policy shape, but final enforcement should not depend on loose application controllers.

Future native boundaries should enforce:

- packet validation
- cursor safety
- deterministic replay
- index rebuild correctness
- correction reconciliation safety
- tombstone audit safety
- export/import integrity
- derived-state comparison
- phone-safe delta preparation

## Not runtime behavior

This boundary does not run reconciliation.

It does not scan packets.

It does not discover peers.

It does not create a desktop app.

It does not start background tasks.

It does not perform export/import.

It does not modify server routes.

It only defines the architecture boundary for future implementation.
