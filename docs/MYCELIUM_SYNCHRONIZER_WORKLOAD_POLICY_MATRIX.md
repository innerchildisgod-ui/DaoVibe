# Mycelium Synchronizer Workload Policy Matrix

Runtime status: `architecture_only`

This document defines the DAOVibe Mycelium synchronizer workload policy matrix.
The matrix connects the synchronizer architecture from Commit 42 to the device
capability policy boundary from Commit 43. It is a planning boundary only. It
does not implement runtime behavior, scheduler execution, sync execution, peer
discovery, networking, storage writes, timers, background tasks, cloud calls,
server route changes, mobile app code, or native code.

## Why This Matrix Exists

Commit 42 named the Mycelium synchronizers: packet, phrase, meaning,
correction, tombstone, identity, settings, diagnostics, and ledger portability.
Commit 43 named the device capability policy boundary: phones are bounded peers,
and laptops/desktops are preferred for heavier compute, storage, validation,
indexing, diagnostics, reconciliation, export/import, and portability review.

This matrix is the architecture-only join between those two boundaries. It lets
future synchronizer planning ask which workloads belong to a synchronizer, what
phones may do, what laptops/desktops should prefer, and what must remain behind
future native enforcement.

## How The Boundaries Connect

The synchronizer architecture answers, "Which concern is being synchronized?"
The device capability policy answers, "Which device class should handle this
kind of work?" The workload matrix answers, "For this synchronizer, how do those
responsibilities line up?"

For example, the packet synchronizer is connected to packet acceptance, packet
validation, ledger import, and ledger export workloads. Phones may accept
bounded packet deltas. Laptops/desktops are preferred for bulk validation,
import review, export review, and reconciliation.

The complete inert matrix lives in
`src/mycelium/SynchronizerWorkloadPolicyMatrix.ts`.

## Phones Are Bounded Peers

Phones are real Mycelium peer nodes, not thin clients. They may keep local and
offline state, accept bounded packet deltas, maintain bounded phrase and meaning
views, review identity and settings deltas, and expose lightweight diagnostics
summaries.

They remain bounded because phones have tighter battery, storage, foreground
execution, and platform limits. The matrix therefore keeps heavy indexing, bulk
reconciliation, full diagnostics scans, and large ledger portability work away
from phones by default.

## Laptops And Desktops Handle Heavier Work

Laptops/desktops are preferred for work that benefits from more compute, more
storage, longer local availability, and better review ergonomics. That includes
bulk packet validation, phrase and meaning indexing, correction and tombstone
audits, diagnostics scans, reconciliation reports, ledger export/import, and
portability verification.

They are still Mycelium peers around the same protocol core. Heavier device
responsibility does not make them a separate source of truth.

## Not Runtime Scheduling

This matrix does not decide when work runs, how often it runs, or whether a
specific device is currently eligible. It does not start jobs, register handlers,
set timers, or execute background tasks.

Runtime scheduling will need live device state, user consent, battery state,
storage state, and platform limits. This matrix only provides static policy
intent for future planning.

## Not Peer Discovery

This matrix does not find peers, advertise peers, select peers, negotiate
transport, or create connections. Peer discovery is a separate runtime concern.

Keeping the matrix separate avoids turning architecture policy into networking
behavior.

## Not Cloud Sync

This matrix does not define managed remote synchronization, remote backup,
hosted identity ownership, remote phrase state, or remote scheduling. Mycelium
state remains local-first and packet-ledger based in this boundary.

The matrix may describe what a synchronizer is allowed or discouraged to do, but
it does not introduce remote services or require them for correctness.

## Deltas And Events Only

Mycelium synchronizers should move changes, deltas, cursors, manifests,
summaries, and events. They should not repeatedly transmit unchanged state.

This keeps phone participation bounded, makes offline catch-up easier to audit,
and preserves a clear trail of what actually changed.

## Packet Ledger Truth

The packet ledger remains the source of truth. Phrase indexes, meaning
candidates, correction views, tombstone previews, identity metadata, settings
views, diagnostics summaries, and portability manifests must remain reproducible
from valid packets or explicitly local observations.

If two devices receive the same valid packets, they must derive the same
Mycelium state. The matrix may prefer one device class for a workload, but it
must not create device-specific truth.

## Future Native Enforcement

TypeScript can describe architecture boundaries, policy constants, and advisory
planning surfaces. Critical enforcement should move behind Rust, WASM, or native
Mycelium boundaries.

Packet admission, replay protection, signature verification, deterministic
derivation, scoring checks, correction maturity, tombstone enforcement, secure
identity storage, diagnostics redaction, portability validation, and bulk packet
integrity checks are future enforcement concerns. The matrix names where those
boundaries belong without implementing them.

## Matrix Summary

| Synchronizer | Phone Role | Laptop/Desktop Role |
| --- | --- | --- |
| `packet` | Accept bounded packet deltas. | Prefer bulk validation, import review, export review, and reconciliation. |
| `phrase` | Use bounded local phrase lookup and accept phrase delta packets. | Prefer indexing, diagnostics, and larger phrase reconciliation. |
| `meaning` | Keep local/offline meaning candidates and bounded updates. | Prefer heavier scoring, indexing, and reconciliation. |
| `correction` | Accept bounded correction proposal and vote deltas. | Prefer correction audits, contested correction review, and reconciliation. |
| `tombstone` | Accept tombstone deltas needed to avoid resurrecting inactive state. | Prefer tombstone audits, cleanup review, and ledger-derived pruning checks. |
| `identity` | Hold bounded local identity/device state for offline use. | Prefer identity diagnostics and consistency review. |
| `settings` | Hold local settings and bounded settings deltas. | Help review conflicts and portability. |
| `diagnostics` | Expose lightweight diagnostics summaries only. | Prefer full scans, packet audits, index checks, and reconciliation reports. |
| `ledger_portability` | Participate in bounded import/export awareness. | Prefer full ledger export/import, portability verification, and bulk integrity checks. |
