# Mycelium Bounded Phone Sync Budget Boundary

Commit 45 defines the Mycelium bounded phone sync budget boundary.

This document is architecture-only. It does not implement runtime sync, peer discovery, mobile app behavior, desktop packaging, cloud sync, scheduling, networking, or native enforcement.

## Why this boundary exists

Mycelium treats phones as real peer nodes, not thin clients.

A phone may hold local state, work offline, accept bounded packet deltas, queue outgoing events, and participate in synchronization. But a phone should not be treated like an unlimited always-on server, desktop daemon, or full archival validator.

This boundary exists to prevent future Mycelium sync work from accidentally pushing heavy reconciliation, diagnostics, indexing, ledger scans, or export/import work onto phones by default.

## Core rule

The packet ledger remains the source of truth.

Only changes, deltas, and events should move between devices. Repeated unchanged state should not be transmitted.

Same valid packets should derive the same state on every device.

## Phone nodes

Phone nodes are valid bounded peers.

They may:

- hold local offline Mycelium state
- accept bounded packet deltas
- perform lightweight validation needed for local safety
- keep bounded phrase and meaning state
- apply correction and tombstone deltas needed for local consistency
- hold local identity and settings state
- queue outgoing events
- resume sync using cursors

They should avoid by default:

- full ledger scans
- bulk reconciliation
- large diagnostics
- full index rebuilds
- continuous background sync loops
- large export/import work
- repeated transmission of unchanged state

## Laptop and desktop nodes

Laptop and desktop nodes are preferred for heavier Mycelium work.

They are better suited for:

- larger packet validation
- phrase and meaning indexing
- correction reconciliation
- tombstone audits
- diagnostics scans
- full or large-window ledger scans
- export/import review
- portability verification
- deterministic state mismatch review

This does not make phones passive clients. It means phones stay bounded while heavier devices absorb heavy work.

## Budget categories

This boundary defines phone sync budget pressure across:

- battery
- storage
- network
- CPU
- thermal limits
- background execution
- ledger scans
- diagnostics
- reconciliation
- export/import

Each category describes what a phone may do, what it should avoid, when work should defer to a laptop/desktop, and where future native enforcement should eventually live.

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 adds the mobile constraint layer: phones are real peers, but phone work must remain bounded.

## Not runtime behavior

This boundary does not schedule sync.

It does not discover peers.

It does not perform networking.

It does not scan the ledger.

It does not run diagnostics.

It does not export or import packets.

It does not enforce mobile background behavior.

It only defines the architecture boundary for future implementation.

## Future native boundary

Critical enforcement should eventually move behind Rust/WASM/native boundaries.

TypeScript can define the shape of the policy, but final enforcement should not depend on loose application controllers.

Future native boundaries should enforce:

- battery-aware admission
- storage quotas
- sync throttling
- deterministic packet validation
- bounded ledger replay
- safe export/import validation
- reconciliation correctness
- mobile platform constraints

## DAOVibe root principle

DAOVibe devices should hold important local state.

Phones must not become thin clients.

Laptops/desktops must not become centralized servers.

Mycelium should preserve one protocol core across multiple device shells, with bounded phone participation and heavier laptop/desktop reconciliation.
