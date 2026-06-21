# Mycelium Sync Conflict Classification Boundary

Commit 48 defines the Mycelium sync conflict classification boundary.

This document is architecture-only. It does not implement runtime repair, reconciliation, networking, peer discovery, storage, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Mycelium sync must not blindly repair state.

Before a device can repair or reconcile anything, it must classify the kind of conflict it is seeing.

A missing packet is not the same as an invalid packet.

A tombstone conflict is not the same as a correction contest.

A cursor gap is not the same as a derived meaning mismatch.

This boundary gives future Mycelium synchronizers stable language for describing conflicts without implementing repair behavior yet.

## Core rule

The packet ledger remains the source of truth.

Conflict classification must explain why devices disagree. It must not become a replacement source of truth.

Same valid packets should derive the same state on every device.

## Classification is not repair

This boundary does not:

- repair packets
- resolve conflicts
- choose winners
- discover peers
- run sync
- scan storage
- start diagnostics
- export or import ledgers
- enforce native validation

It only classifies possible conflict types.

## Conflict types

This boundary defines conflict classes for:

- missing packets
- duplicate packets
- invalid packets
- expired packets
- cursor gaps
- packet order gaps
- tombstone conflicts
- correction contests
- weak correction authority
- derived phrase mismatches
- derived meaning mismatches
- identity state mismatches
- settings state mismatches
- diagnostics mismatches
- ledger portability mismatches

## Phone role

Phones are real bounded peers, not thin clients.

Phones may classify small local conflicts, report bounded summaries, accept small deltas, and surface local warnings.

Phones should defer heavy conflict review when the conflict requires:

- large packet windows
- full ledger scans
- contested correction audits
- tombstone audits
- deep diagnostics
- large export/import review
- deterministic replay comparison

## Laptop/desktop role

Laptops and desktops are preferred for deeper conflict review.

They may later help with:

- large packet-window comparison
- missing packet repair planning
- invalid packet audits
- correction contest review
- tombstone conflict review
- derived state comparison
- diagnostics scans
- ledger portability integrity checks

They are heavier peers, not central authorities.

## Delta-only rule

Conflict handling should not create repeated unchanged full-state sync.

Future repair should prefer:

- missing packet deltas
- tombstone deltas
- correction deltas
- cursor repair windows
- compact mismatch summaries
- bounded diagnostics
- phone-safe repair guidance

## Deterministic derived state

If two devices have the same valid packets and the same policy rules, they should derive the same state.

A mismatch should be explainable through:

- missing packets
- invalid packets
- expired packets
- cursor gaps
- ordering gaps
- tombstones
- correction vote differences
- identity or settings change differences
- policy version mismatch
- deterministic derivation bugs

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation responsibilities.

Commit 47 defined sync cursor and packet window contracts.

Commit 48 defines the conflict classification language that future reconciliation can use before any repair is attempted.

## Future native boundary

Critical conflict classification and repair validation should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce:

- packet validity checks
- duplicate packet idempotency
- cursor safety
- packet ordering safety
- tombstone conflict review
- correction threshold review
- deterministic phrase and meaning derivation
- identity/settings conflict policy
- ledger portability integrity

TypeScript defines the boundary here. It does not enforce it.
