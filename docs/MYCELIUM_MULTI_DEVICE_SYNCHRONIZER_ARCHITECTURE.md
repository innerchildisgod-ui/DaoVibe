# Mycelium Multi-Device Synchronizer Architecture

Runtime status: `architecture_only`

This document defines the DAOVibe Mycelium synchronizer architecture for
multiple local devices. It describes boundaries, responsibilities, and future
enforcement placement. It does not implement runtime behavior, server routes,
networking, storage writes, peer discovery, timers, background tasks, mobile app
code, desktop packaging, or native code.

## Why Synchronizers Exist

Mycelium can run across more than one device, but those devices should not push
large repeated snapshots at each other. The synchronizer model splits sync into
small concerns so each concern can move only the changes, deltas, or events it
owns.

This keeps the packet ledger central, makes offline catch-up easier to reason
about, and lets each device shell stay bounded. A packet synchronizer can care
about ledger changes. A phrase synchronizer can care about phrase-derived
indexes. A diagnostics synchronizer can care about sync health. Those concerns
should not collapse into one broad controller that quietly becomes the source of
truth.

## Device Responsibilities

Mycelium has one protocol core and multiple device shells.

### `phone`

Phones are real bounded peer nodes, not thin clients. They can hold local state,
operate offline, and participate in phrase, meaning, correction, identity,
settings, and bounded packet-delta flows.

Phone nodes must remain battery-aware, bounded-storage, and app-store-safe. They
should avoid large ledger scans, sustained background work, and heavy
reconciliation unless a future policy explicitly allows it.

### `laptop_desktop`

Laptop and desktop nodes are preferred for heavier compute, storage, validation,
reconciliation, diagnostics, indexing, ledger export/import, packet audits, and
future native-boundary enforcement.

They are still device shells around the same Mycelium protocol core. They may do
heavier work, but they do not replace the packet ledger as the source of truth.

## Packet Ledger Truth

The packet ledger remains the source of truth for Mycelium state. Derived views
such as phrase indexes, meaning summaries, correction status, tombstone previews,
identity metadata, settings views, diagnostics, and portability manifests must
remain reproducible from valid packets or explicitly local observations.

If two devices receive the same valid packets, they must derive the same
Mycelium state. This rule lets devices be temporarily out of sync without
turning device-local caches into competing truth sources.

## Delta And Event Sync

Synchronizers should move changes, deltas, and events. They should not repeatedly
transmit unchanged state.

Delta and event sync matters because phones have bounded storage and battery,
offline devices need clear catch-up cursors, and laptops/desktops need auditable
packet windows for reconciliation. Re-sending unchanged derived state wastes
resources and makes it harder to prove what actually changed.

## Split By Concern

The architecture defines exactly these synchronizer names:

| Name | Purpose | Preferred Device Class |
| --- | --- | --- |
| `packet` | Move valid packet-ledger changes, cursors, manifests, and integrity summaries. | `laptop_desktop` |
| `phrase` | Align phrase observations and phrase indexes from packet-derived changes. | `phone` |
| `meaning` | Align meaning proposals, votes, and reproducible derivation checkpoints. | `phone` |
| `correction` | Align correction proposals, votes, and maturity events derived from packets. | `phone` |
| `tombstone` | Align tombstone proposals, votes, and non-destructive previews. | `laptop_desktop` |
| `identity` | Align safe identity metadata without moving private key material. | `phone` |
| `settings` | Align explicit settings events while preserving local-only preferences. | `phone` |
| `diagnostics` | Align bounded health summaries and reproducible ledger statistics. | `laptop_desktop` |
| `ledger_portability` | Define import/export boundaries for valid packet-ledger material. | `laptop_desktop` |

Each synchronizer has a name, purpose, source of truth, allowed sync material,
forbidden sync material, preferred device class, phone constraints,
laptop/desktop responsibilities, future native boundary, and
`architecture_only` runtime status in
`src/mycelium/MultiDeviceSynchronizerArchitecture.ts`.

## Architecture Only

The TypeScript module exports inert types and constants only. It is a map of
boundaries, not a controller. It performs no I/O, networking, storage writes,
peer discovery, timers, background tasks, or runtime registration.

This matters because architecture should not accidentally change current sync
behavior. Existing Mycelium simulations and behavior remain the verification
surface for this commit.

## Future Native Boundaries

TypeScript can describe Mycelium boundaries, application glue, advisory stubs,
and documentation. Critical enforcement should eventually live behind
Rust/WASM/native boundaries.

Packet validation, replay protection, ledger admission, deterministic
derivation, identity verification, tombstone execution rules, import validation,
diagnostic redaction, and integrity proofs are enforcement concerns. Keeping
those behind future low-level boundaries gives Mycelium a clearer path to
auditable, portable, and device-local enforcement without making loose
TypeScript controllers responsible for protocol truth.
