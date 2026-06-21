# Mycelium Device Capability Policy Boundary

Runtime status: `architecture_only`

This document defines the DAOVibe Mycelium device capability policy boundary.
It describes which device class is allowed, preferred, or discouraged for each
future workload category. It does not implement runtime behavior, scheduling,
networking, storage writes, peer discovery, timers, background tasks, mobile app
code, native code, or server route changes.

## Why This Boundary Exists

Commit 42 defined the multi-device synchronizer architecture. That architecture
splits future synchronization by concern, keeps the packet ledger as the source
of truth, and requires devices to exchange changes, deltas, and events instead
of repeatedly transmitting unchanged state.

This policy boundary adds the next architectural layer: it names which device
classes are suited to each kind of work. Future synchronizers can use this as a
stable advisory map when deciding what a phone may do locally, what a
laptop/desktop should prefer to handle, and which decisions eventually need
native enforcement.

## Device Classes

Mycelium currently defines two device classes for policy purposes:

| Device Class | Policy Role |
| --- | --- |
| `phone` | A real bounded peer node that can keep local/offline state, accept bounded packet deltas, and perform lightweight validation for safe local use. |
| `laptop_desktop` | A heavier peer node preferred for bulk validation, indexing, diagnostics, reconciliation, ledger export/import, and portability review. |

Phones are not thin clients. They are real Mycelium peers with local state and
offline participation. The boundary still keeps their work bounded because
mobile devices have tighter battery, storage, foreground execution, and platform
constraints.

Laptops and desktops are not a separate source of truth. They are preferred for
heavier work because they usually have more compute, storage, durable local
availability, and better ergonomics for review. They still derive state from the
same valid packet ledger as every other device.

## Capability Tiers

The policy uses three advisory capability tiers:

| Tier | Meaning |
| --- | --- |
| `lightweight` | Safe bounded work suitable for local participation, previews, or small packet windows. |
| `standard` | Ordinary peer work that remains bounded and does not require bulk scans or sustained heavy processing. |
| `heavy` | Bulk validation, indexing, reconciliation, diagnostics, export/import, and portability review. |

Phones may do lightweight work and some standard bounded work. They should avoid
heavy indexing, bulk reconciliation, full diagnostic scans, and large ledger
export/import unless a future policy explicitly allows it.

Laptops/desktops should prefer heavy validation, indexing, diagnostics, bulk
reconciliation, ledger export/import, and portability review.

## Packet Ledger Truth

The packet ledger remains the source of truth. Derived views such as phrase
indexes, meaning indexes, correction status, tombstone review state, identity
metadata, settings views, diagnostics, and portability manifests must remain
reproducible from valid packets or explicitly local observations.

If two devices receive the same valid packets, they must derive the same
Mycelium state. Capability policy may decide where work should preferably run,
but it must not create device-specific truth.

No device class should repeatedly transmit unchanged state. Mycelium
synchronizers should move changes, deltas, and events.

## Workload Decisions

The TypeScript boundary defines policy decisions for these workload categories:

| Workload | Preferred Device Class | Maximum Phone Role | Laptop/Desktop Responsibility |
| --- | --- | --- | --- |
| `packet_acceptance` | `phone` | `standard` | `standard` |
| `packet_validation` | `laptop_desktop` | `lightweight` | `heavy` |
| `phrase_indexing` | `laptop_desktop` | `standard` | `heavy` |
| `meaning_indexing` | `laptop_desktop` | `standard` | `heavy` |
| `correction_reconciliation` | `laptop_desktop` | `standard` | `heavy` |
| `tombstone_reconciliation` | `laptop_desktop` | `lightweight` | `heavy` |
| `identity_sync_review` | `phone` | `standard` | `standard` |
| `settings_sync_review` | `phone` | `standard` | `standard` |
| `diagnostics_scan` | `laptop_desktop` | `lightweight` | `heavy` |
| `ledger_export` | `laptop_desktop` | `lightweight` | `heavy` |
| `ledger_import` | `laptop_desktop` | `lightweight` | `heavy` |
| `ledger_portability_review` | `laptop_desktop` | `lightweight` | `heavy` |

The complete inert policy map lives in
`src/mycelium/DeviceCapabilityPolicyBoundary.ts`.

## Separate From Discovery And Scheduling

This boundary does not find peers, choose peers, negotiate transports, schedule
work, start background jobs, or register runtime handlers. It only names policy
intent. Runtime discovery and scheduling are separate concerns because they
involve live device state, transport availability, user consent, platform
limits, and execution timing.

Keeping capability policy separate lets future synchronizers ask, "Is this
workload appropriate for this device class?" without also deciding how devices
locate each other or when work is run.

## Architecture Only

The TypeScript module exports inert types and constants only. It performs no
I/O, networking, storage writes, peer discovery, timers, background tasks,
runtime registration, server route changes, or simulation changes.

This commit is intentionally descriptive. It gives future synchronizers a
stable vocabulary for device capability policy while preserving current
Mycelium behavior.

## Future Native Enforcement

TypeScript can describe boundaries and advisory policy, but critical enforcement
should eventually move behind Rust, WASM, or native Mycelium boundaries.

That future boundary is where packet admission, hash verification, signature
verification, deterministic derivation, replay protection, import validation,
diagnostic redaction, portability proofs, and destructive safety rules belong.
The policy file names those enforcement boundaries without implementing them.

## Relationship To Commit 42

Commit 42 defined future synchronizers such as packet, phrase, meaning,
correction, tombstone, identity, settings, diagnostics, and ledger portability
synchronizers. This policy boundary supports that architecture by defining the
device capability rules those synchronizers can later consult.

It does not change the synchronizers, existing simulations, or runtime sync
behavior. It only adds the policy map that future work can use when deciding
which device class should handle which workload.
