# Mycelium Deterministic State Convergence Boundary

Commit 52 defines the Mycelium deterministic state convergence boundary.

This document is architecture-only. It does not implement runtime sync, repair execution, storage writes, networking, peer discovery, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Mycelium needs deterministic state.

The precise rule is:

    same valid packets + compatible policy rules = same derived state

Same packets alone are not enough if policy rules differ.

For example, two devices can disagree if they use different rules for packet validation, correction thresholds, tombstones, meaning scoring, settings conflicts, or repair guards.

## Packet ledger rule

The packet ledger remains the source of truth.

Indexes, diagnostics, cursors, repair plans, and summaries are not source truth.

They are derived or advisory structures.

## What must converge

Mycelium must eventually converge these derived areas:

- packet acceptance
- phrase state
- meaning state
- correction state
- tombstone state
- identity state
- settings state
- diagnostics state
- ledger portability state

## Phones

Phones are real bounded peers.

Phones may hold local derived state, work offline, accept bounded deltas, show local warnings, and defer heavy review.

Phones should avoid full replay, heavy diagnostics, large correction review, large tombstone audits, and large export/import integrity checks by default.

## Laptops/desktops

Laptops and desktops are preferred for heavier convergence work.

They may later handle larger packet-window review, deterministic replay diagnostics, index rebuilds, correction threshold review, tombstone audits, and portability integrity checks.

They are heavier peers, not central authorities.

## Mismatch causes

Devices may disagree because of:

- missing packets
- invalid packets
- expired packets
- cursor gaps
- packet order gaps
- tombstone differences
- correction vote differences
- weak correction authority
- policy version mismatch
- derivation bugs
- incomplete import/export windows

A mismatch must be explainable before repair is attempted.

## Delta-only rule

Convergence should not require repeated unchanged full-state sync.

Future sync should prefer:

- missing packet deltas
- correction deltas
- tombstone deltas
- cursor repair windows
- compact diagnostics summaries
- bounded repair guidance
- portable packet windows

Repeated unchanged derived state should not be transmitted.

## Relation to previous commits

Commit 42 defined the multi-device synchronizer architecture.

Commit 43 defined the device capability policy boundary.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation responsibilities.

Commit 47 defined sync cursor and packet window contracts.

Commit 48 defined sync conflict classification.

Commit 49 defined sync repair planning.

Commit 50 defined sync repair execution guards.

Commit 51 defined policy version compatibility.

Commit 52 defines the deterministic convergence rule tying these boundaries together.

## Future native boundary

Critical convergence checks should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce or verify:

- packet acceptance
- deterministic replay
- meaning scoring
- correction thresholds
- tombstone lifecycle state
- identity/settings conflict rules
- diagnostics integrity
- ledger portability replay

TypeScript defines the boundary here. It does not enforce it.
