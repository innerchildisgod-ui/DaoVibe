# Mycelium Sync Repair Planning Boundary

Commit 49 defines the Mycelium sync repair planning boundary.

This document is architecture-only. It does not implement repair execution, runtime sync, networking, peer discovery, storage writes, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Commit 48 classified sync conflicts.

Commit 49 defines what kind of repair plan may be prepared after a conflict is classified.

Classification answers:

- what is wrong?

Repair planning answers:

- what kind of repair is allowed?
- which device class should handle it?
- what should a phone avoid?
- what should a laptop/desktop review?
- what must never be produced?

This prevents Mycelium from blindly repairing state.

## Core rule

The packet ledger remains the source of truth.

Repair planning must not become a new source of truth.

A repair plan should help devices converge back to valid packet-ledger state.

## Repair planning is not repair execution

This boundary does not:

- repair packets
- mutate storage
- run sync
- scan the ledger
- discover peers
- open network connections
- schedule background work
- export or import ledgers
- enforce native validation

It only defines the shape of future repair planning.

## Repair plan categories

This boundary defines repair planning for:

- requesting missing packets
- ignoring duplicate delivery
- rejecting invalid packets
- deferring expired packet review
- repairing cursor gaps
- reviewing packet order
- applying tombstone deltas
- deferring correction contest review
- marking weak correction state as provisional
- rebuilding derived phrase state
- rebuilding derived meaning state
- reviewing identity state
- reviewing settings state
- preparing diagnostics summaries
- reviewing ledger portability integrity

## Phone role

Phones are real bounded Mycelium peers.

Phones may participate in bounded repair planning, request small packet windows, accept small deltas, show local warnings, and preserve offline state.

Phones should avoid:

- full ledger replay
- bulk repair planning
- heavy diagnostics
- large correction review
- full index rebuilds
- large export/import integrity review
- repeated unchanged full-state sync

## Laptop/desktop role

Laptops and desktops are preferred for heavier repair planning.

They may later help with:

- larger packet-window comparison
- invalid packet audits
- cursor-gap repair planning
- packet order review
- tombstone audits
- correction contest review
- phrase and meaning rebuild review
- identity/settings conflict review
- diagnostics summaries
- ledger portability integrity checks

They are heavier peers, not central authorities.

## Delta-only repair planning

Repair plans should produce bounded outputs such as:

- missing packet requests
- packet deltas
- cursor repair hints
- tombstone deltas
- correction deltas
- provisional correction summaries
- phrase or meaning rebuild summaries
- diagnostics summaries
- phone-safe repair guidance

Repair plans must not produce repeated unchanged full-state sync.

## Deterministic derived state

Same valid packets should derive the same state on every device.

A repair plan should help restore that condition.

If devices disagree, the repair path should explain whether the cause is:

- missing packets
- invalid packets
- duplicate packets
- expired packets
- cursor gaps
- packet order gaps
- tombstone differences
- correction vote differences
- identity/settings changes
- diagnostics mismatch
- ledger portability mismatch
- policy version mismatch
- deterministic derivation bug

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation responsibilities.

Commit 47 defined sync cursor and packet window contracts.

Commit 48 defined sync conflict classification.

Commit 49 defines repair planning after classification, without executing repair.

## Future native boundary

Critical repair validation should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce:

- packet validation
- missing packet repair safety
- cursor repair safety
- packet ordering safety
- tombstone repair integrity
- correction threshold safety
- deterministic phrase and meaning rebuilds
- identity/settings conflict policy
- diagnostics integrity
- ledger portability validation

TypeScript defines the boundary here. It does not enforce it.
