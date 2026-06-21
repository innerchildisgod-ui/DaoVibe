# Mycelium Packet Flow Sync Discipline Boundary

Commit 53 defines the Mycelium packet flow sync discipline boundary.

This document is architecture-only. It does not implement runtime sync, networking, peer discovery, storage writes, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Mycelium packet movement must stay manageable and fast.

Packets going out of a node and packets coming into a node should rely on sync discipline:

    small deltas
    bounded packet windows
    cursors
    compact summaries
    phone-safe flow
    laptop/desktop review for larger windows

The system should not throw large packets everywhere.

## Core rule

The packet ledger remains the source of truth.

Only changes, deltas, events, cursors, bounded packet windows, and compact summaries should move.

Repeated unchanged state should not be transmitted.

## Outgoing packet flow

When packets leave a device, they should leave as:

- small packet deltas
- bounded outgoing events
- cursor-aware responses
- compact summaries
- phone-safe chunks where needed

Outgoing flow should avoid:

- broad packet floods
- unbounded gossip
- full local state transfer
- repeated unchanged derived state

## Incoming packet flow

When packets enter a device, they should arrive as bounded sync inputs.

Incoming flow should avoid:

- unbounded packet floods
- oversized phone batches
- trusted imports without review
- invalid packets entering derived state

Phones may accept small bounded deltas.

Laptops/desktops are preferred for larger incoming-window review.

## Cursor discipline

A cursor helps a device resume sync from a known point.

A cursor is not truth.

The packet ledger is truth.

Cursor-based sync keeps the system fast because a device can ask:

    what changed after this point?

instead of asking for everything again.

## Bounded packet windows

A packet window is a manageable chunk of packet-ledger events.

Packet windows should stay bounded so sync does not become slow.

Large windows should be split, summarized, or deferred to laptops/desktops.

## Phones

Phones are real bounded peers, not thin clients.

Phones may:

- send small outgoing packet deltas
- receive small incoming packet deltas
- queue offline events
- resume with cursors
- consume bounded packet windows
- use compact summaries

Phones should avoid:

- giant packet batches
- full ledger replay by default
- repeated unchanged state transfer
- always-on packet broadcast
- large import/export review

## Laptops/desktops

Laptops and desktops are heavier peers.

They are preferred for:

- larger packet-window review
- bulk validation
- diagnostics
- reconciliation
- splitting large packet windows
- preparing phone-safe deltas
- reviewing export/import windows

They are not central servers.

They do not own truth.

## Speed principle

Fast Mycelium sync comes from:

    small packets
    bounded windows
    cursor resume
    compact summaries
    no repeated unchanged state
    heavy review on laptops/desktops
    phone-safe deltas

Speed must not break ledger truth.

## Relation to previous commits

Commit 42 defined multi-device synchronizers.

Commit 43 defined device capability policy.

Commit 44 connected synchronizers to workload policy.

Commit 45 bounded phone sync budgets.

Commit 46 defined laptop/desktop reconciliation.

Commit 47 defined cursor and packet-window contracts.

Commit 48 defined conflict classification.

Commit 49 defined repair planning.

Commit 50 defined repair execution guards.

Commit 51 defined policy version compatibility.

Commit 52 defined deterministic state convergence.

Commit 53 defines packet flow discipline so packets entering and leaving Mycelium stay small, sync-driven, and fast.

## Future native boundary

Critical packet-flow checks should eventually move behind Rust/WASM/native boundaries.

Future native boundaries should enforce or verify:

- packet size limits
- bounded window limits
- cursor safety
- delta-only output
- large payload splitting
- phone-safe packet flow
- deterministic replay after split windows
- incoming packet validation
- outgoing packet admission

TypeScript defines the boundary here. It does not enforce it.
