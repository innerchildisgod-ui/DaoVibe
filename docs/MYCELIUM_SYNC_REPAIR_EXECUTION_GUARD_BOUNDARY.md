# Mycelium Sync Repair Execution Guard Boundary

Commit 50 defines the Mycelium sync repair execution guard boundary.

This document is architecture-only. It does not implement repair execution, runtime sync, storage writes, networking, peer discovery, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Commit 48 classified sync conflicts.

Commit 49 defined repair planning.

Commit 50 defines the guardrails that must exist before any future repair execution is allowed.

This prevents Mycelium from turning repair into blind mutation, cloud authority, or device-specific state patching.

## Core rule

The packet ledger remains the source of truth.

A repair must not invent truth.

A repair must not silently erase truth.

A repair must not make diagnostics, cursors, indexes, or derived state more authoritative than packets.

## Guard before execution

Future repair execution should only happen after:

- the conflict is classified
- the repair plan is explicit
- packet-ledger evidence exists
- phone budget limits are respected
- laptop/desktop deferral is used for heavy work
- output remains delta-oriented
- tombstones are respected
- weak correction authority is not finalized
- deterministic replay is preserved
- portability integrity is reviewed where needed

## Phones

Phones are real bounded peers.

Phones may later apply bounded repair deltas, show local warnings, request small packet windows, and preserve offline state.

Phones should not be forced to run:

- full ledger replay
- large repair scans
- heavy diagnostics
- correction contest audits
- tombstone audits
- large export/import integrity checks
- always-on repair loops

## Laptops/desktops

Laptops and desktops are preferred for heavier repair review.

They may later handle:

- large packet-window review
- evidence validation
- repair-plan review
- tombstone safety checks
- correction threshold checks
- deterministic replay checks
- portability integrity checks
- phone-safe repair guidance

They are heavier peers, not central authorities.

## Delta-only repair output

Future repair execution should produce bounded outputs such as:

- packet deltas
- missing packet windows
- cursor repair hints
- tombstone deltas
- correction deltas
- provisional correction summaries
- diagnostics summaries
- portability integrity summaries
- phone-safe repair guidance

Future repair execution must not repeatedly transmit unchanged full state.

## Tombstone safety

Repair must not resurrect deleted, expired, inactive, or tombstoned state without valid packet-ledger evidence.

Repair must not silently erase tombstone packets.

Tombstones are part of ledger truth.

## Correction threshold safety

Weak correction authority must stay provisional.

A single confirm vote should not automatically become final truth.

Absence of reject votes should not be treated as enough authority by itself.

Contested correction state should remain visible until valid packet-backed policy resolves it.

## Deterministic replay

Same valid packets should derive the same state on every device.

Repair should help restore this condition.

Repair must not create device-specific derived state or manual patches that cannot be replayed from packets.

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation responsibilities.

Commit 47 defined sync cursor and packet window contracts.

Commit 48 defined sync conflict classification.

Commit 49 defined sync repair planning.

Commit 50 defines guardrails before future repair execution.

## Future native boundary

Critical repair execution checks should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce:

- packet-ledger evidence validation
- conflict classification validation
- repair-plan validation
- phone budget limits
- delta-only output checks
- tombstone safety
- correction threshold safety
- deterministic replay
- ledger portability integrity

TypeScript defines the guard boundary here. It does not enforce it.
