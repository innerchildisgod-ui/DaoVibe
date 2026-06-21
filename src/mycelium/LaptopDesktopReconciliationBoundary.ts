/**
 * DAOVibe / Mycelium laptop-desktop reconciliation boundary.
 *
 * Architecture-only.
 *
 * This file defines the heavier Mycelium work that laptops/desktops are
 * preferred to perform for multi-device sync. It does not make laptops/desktops
 * central servers, cloud authorities, or final truth owners.
 *
 * The packet ledger remains the source of truth. Laptops/desktops help with
 * validation, indexing, diagnostics, reconciliation, export/import review, and
 * preparing bounded deltas for phone peers.
 *
 * Critical enforcement should eventually live behind Rust/WASM/native
 * boundaries. TypeScript defines the boundary here without enforcing it.
 */

export type MyceliumLaptopDesktopRuntimeStatus = "architecture_only";

export type MyceliumLaptopDesktopWorkloadName =
  | "packet_window_review"
  | "bulk_packet_validation"
  | "phrase_index_rebuild"
  | "meaning_index_rebuild"
  | "correction_contest_review"
  | "tombstone_audit"
  | "diagnostics_scan"
  | "derived_state_comparison"
  | "ledger_export_review"
  | "ledger_import_review"
  | "portability_integrity_check"
  | "phone_delta_preparation";

export interface MyceliumLaptopDesktopReconciliationWorkload {
  readonly name: MyceliumLaptopDesktopWorkloadName;
  readonly purpose: string;
  readonly preferredOnLaptopDesktopBecause: readonly string[];
  readonly mustNotBecome: readonly string[];
  readonly phoneSupportRole: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumLaptopDesktopRuntimeStatus;
}

export const MYCELIUM_LAPTOP_DESKTOP_RECONCILIATION_CORE_RULES = [
  "Laptops/desktops are heavier Mycelium peers, not central servers.",
  "Laptops/desktops are preferred for compute-heavy, storage-heavy, and audit-heavy work.",
  "Phones remain valid bounded peer nodes and must not become thin clients.",
  "The packet ledger remains the source of truth.",
  "Laptops/desktops must not override valid packet-ledger truth with local preference.",
  "Only changes, deltas, events, cursors, summaries, and bounded repair guidance should move.",
  "Repeated unchanged state must not be transmitted.",
  "Same valid packets must derive the same state on every device.",
  "Heavy reconciliation should prepare bounded deltas that phones can safely consume.",
  "Critical enforcement should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_LAPTOP_DESKTOP_RECONCILIATION_BOUNDARY: readonly MyceliumLaptopDesktopReconciliationWorkload[] =
  [
    {
      name: "packet_window_review",
      purpose:
        "Reviews larger packet windows to detect missing packets, duplicate packets, invalid packets, expired packets, and ordering/cursor issues.",
      preferredOnLaptopDesktopBecause: [
        "larger packet windows require more storage",
        "review may require sustained CPU work",
        "desktop/laptop nodes are better suited for long-running checks",
      ],
      mustNotBecome: [
        "a central packet authority",
        "a cloud-owned ledger replacement",
        "a reason to make phones thin clients",
      ],
      phoneSupportRole: [
        "provide bounded packet windows",
        "apply missing packet deltas",
        "resume from cursors",
      ],
      ledgerRule:
        "Packet window review must converge on valid packet-ledger state, not device preference.",
      deltaOnlyRule:
        "Review results should produce missing packet deltas, cursor guidance, or compact summaries instead of repeated full-state sync.",
      deterministicStateRule:
        "Any derived state recommendation must be reproducible from the same valid packet set.",
      futureNativeBoundary:
        "Packet-window validation and cursor safety should eventually move behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "bulk_packet_validation",
      purpose:
        "Handles larger validation batches that are too heavy for phones by default.",
      preferredOnLaptopDesktopBecause: [
        "bulk validation may require sustained CPU",
        "larger local storage can hold more packet history",
        "desktop/laptop sessions can run longer than mobile sessions",
      ],
      mustNotBecome: [
        "an excuse to skip phone-side lightweight safety checks",
        "a centralized validator role",
        "runtime consensus behavior in this architecture file",
      ],
      phoneSupportRole: [
        "perform lightweight local validation",
        "defer heavy validation",
        "accept bounded validation-derived repair deltas only when backed by valid packets",
      ],
      ledgerRule:
        "Bulk validation must validate ledger packets; it must not invent non-ledger state.",
      deltaOnlyRule:
        "Validation outputs should be compact validation summaries or packet deltas, not repeated unchanged derived state.",
      deterministicStateRule:
        "Validation decisions must support same-packet same-state determinism.",
      futureNativeBoundary:
        "Bulk packet validation should eventually move behind native deterministic validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "phrase_index_rebuild",
      purpose:
        "Rebuilds or audits phrase indexes from valid packet-ledger data.",
      preferredOnLaptopDesktopBecause: [
        "index rebuilds can be CPU-heavy",
        "larger phrase histories may exceed phone budgets",
        "diagnostic rebuilds may require longer execution windows",
      ],
      mustNotBecome: [
        "a cloud phrase database",
        "a source of truth separate from packets",
        "a requirement that phones cannot operate offline",
      ],
      phoneSupportRole: [
        "keep bounded local phrase indexes",
        "accept phrase delta packets",
        "defer full rebuilds",
      ],
      ledgerRule:
        "Phrase indexes are derived from packet-ledger truth and must be rebuildable from valid packets.",
      deltaOnlyRule:
        "Phrase synchronization should move phrase-related packet deltas or compact rebuild summaries, not repeated unchanged phrase state.",
      deterministicStateRule:
        "The same valid phrase packets must produce the same phrase index result.",
      futureNativeBoundary:
        "Phrase index rebuild and audit logic should eventually move behind native indexing boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "meaning_index_rebuild",
      purpose:
        "Rebuilds or audits meaning indexes and meaning-derived state from valid packets.",
      preferredOnLaptopDesktopBecause: [
        "meaning scoring and indexing may become CPU-heavy",
        "larger meaning histories can exceed phone budgets",
        "audits may need sustained execution",
      ],
      mustNotBecome: [
        "a final meaning authority outside the ledger",
        "a cloud meaning service",
        "a reason to repeatedly transmit unchanged derived meaning state",
      ],
      phoneSupportRole: [
        "keep bounded local meaning candidates",
        "apply meaning packet deltas",
        "defer heavy scoring or index rebuilds",
      ],
      ledgerRule:
        "Meaning-derived state must remain tied to packet-ledger truth.",
      deltaOnlyRule:
        "Meaning sync should prefer packet deltas, correction deltas, and compact summaries over repeated full derived state.",
      deterministicStateRule:
        "The same valid packets and scoring rules must derive the same meaning state.",
      futureNativeBoundary:
        "Meaning scoring and deterministic derivation should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "correction_contest_review",
      purpose:
        "Reviews contested correction state, weak correction signals, and correction vote patterns without treating weak single-vote state as final authority.",
      preferredOnLaptopDesktopBecause: [
        "correction review can require larger history windows",
        "contested states need careful packet-ledger audit",
        "phones should avoid heavy correction history scans",
      ],
      mustNotBecome: [
        "a subjective correction authority",
        "a shortcut around packet votes",
        "a runtime moderation engine in this boundary file",
      ],
      phoneSupportRole: [
        "accept bounded correction proposal deltas",
        "accept bounded correction vote deltas",
        "surface local correction status",
        "defer contested review",
      ],
      ledgerRule:
        "Correction review must be derived from correction proposal, vote, tombstone, and related ledger packets.",
      deltaOnlyRule:
        "Correction reconciliation should move correction deltas and compact review summaries, not repeated unchanged correction state.",
      deterministicStateRule:
        "Correction status must be reproducible from the same valid correction packet set and policy rules.",
      futureNativeBoundary:
        "Correction contest review should eventually move behind native validation/reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "tombstone_audit",
      purpose:
        "Audits tombstone packets to prevent deleted, expired, or invalidated state from being silently resurrected.",
      preferredOnLaptopDesktopBecause: [
        "tombstone audits may require older packet windows",
        "cleanup review can be storage-heavy",
        "phones should only need bounded tombstone deltas for local consistency",
      ],
      mustNotBecome: [
        "silent ledger erasure",
        "non-ledger deletion authority",
        "a reason to hide packet history",
      ],
      phoneSupportRole: [
        "accept tombstone deltas",
        "avoid resurrecting tombstoned local state",
        "defer larger cleanup scans",
      ],
      ledgerRule:
        "Tombstone audit must preserve ledger truth and must not erase the fact that a tombstone packet existed.",
      deltaOnlyRule:
        "Tombstone sync should move tombstone deltas and compact audit summaries rather than repeated full cleanup state.",
      deterministicStateRule:
        "The same valid packet and tombstone set must derive the same active/inactive state.",
      futureNativeBoundary:
        "Tombstone validation and pruning safety should eventually move behind native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "diagnostics_scan",
      purpose:
        "Runs deeper Mycelium diagnostics across packet counts, cursor health, index consistency, correction state, tombstone state, and derived-state mismatches.",
      preferredOnLaptopDesktopBecause: [
        "full diagnostics can be CPU-heavy",
        "diagnostics may require larger local history",
        "desktop/laptop nodes can run longer inspection tasks",
      ],
      mustNotBecome: [
        "a replacement source of truth",
        "mandatory cloud telemetry",
        "heavy phone background behavior",
      ],
      phoneSupportRole: [
        "show lightweight diagnostics summaries",
        "surface local errors",
        "provide bounded packet/cursor summaries",
      ],
      ledgerRule:
        "Diagnostics may explain ledger-derived state but must not override packet-ledger truth.",
      deltaOnlyRule:
        "Diagnostics should produce compact summaries and repair hints, not repeated unchanged diagnostic state.",
      deterministicStateRule:
        "Diagnostic mismatch claims should be traceable to packet-ledger differences or deterministic derivation differences.",
      futureNativeBoundary:
        "Diagnostic integrity checks should eventually move behind native audit boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "derived_state_comparison",
      purpose:
        "Compares derived Mycelium state across devices to detect whether the same valid packets are producing the same phrase, meaning, correction, tombstone, identity, settings, and diagnostic state.",
      preferredOnLaptopDesktopBecause: [
        "cross-device state comparison can be large",
        "phones should avoid heavy comparison scans",
        "laptops/desktops can prepare smaller mismatch summaries",
      ],
      mustNotBecome: [
        "manual override of packet-ledger truth",
        "cloud conflict resolution",
        "a runtime scheduler in this boundary file",
      ],
      phoneSupportRole: [
        "provide bounded state summaries",
        "apply valid repair deltas",
        "defer deep comparison",
      ],
      ledgerRule:
        "Derived state comparison must always trace back to packet-ledger inputs.",
      deltaOnlyRule:
        "Comparison should move compact hashes, summaries, missing packet references, or deltas rather than repeated full state.",
      deterministicStateRule:
        "Same valid packets must derive the same state; mismatches should be explained by missing packets, invalid packets, policy version, or derivation bugs.",
      futureNativeBoundary:
        "Deterministic derived-state comparison should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ledger_export_review",
      purpose:
        "Reviews Mycelium ledger export boundaries for integrity, portability, and deterministic replay safety.",
      preferredOnLaptopDesktopBecause: [
        "full export can be storage-heavy",
        "integrity review can require bulk validation",
        "phones should not perform large exports by default",
      ],
      mustNotBecome: [
        "currency export",
        "payment export",
        "marketplace export",
        "cloud backup requirement",
      ],
      phoneSupportRole: [
        "show bounded export status",
        "hold small portable packet windows where policy allows",
        "defer full export review",
      ],
      ledgerRule:
        "Ledger export must preserve packet-ledger truth and replayability.",
      deltaOnlyRule:
        "Export review should prefer verifiable packet windows and compact integrity summaries.",
      deterministicStateRule:
        "Exported ledger packets should replay into the same derived Mycelium state under the same rules.",
      futureNativeBoundary:
        "Ledger export integrity should eventually move behind native portability boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ledger_import_review",
      purpose:
        "Reviews imported Mycelium packet windows before they affect derived local state.",
      preferredOnLaptopDesktopBecause: [
        "import review can require bulk validation",
        "large imports can exceed phone storage and CPU budgets",
        "laptops/desktops are better suited for integrity checks",
      ],
      mustNotBecome: [
        "blind trust in external archives",
        "cloud-controlled import authority",
        "runtime import implementation in this boundary file",
      ],
      phoneSupportRole: [
        "verify small imports needed for local use",
        "defer large import review",
        "apply bounded valid import deltas",
      ],
      ledgerRule:
        "Imported data must be valid packet-ledger data before it contributes to derived state.",
      deltaOnlyRule:
        "Import review should convert valid imports into bounded packet windows or compact deltas where possible.",
      deterministicStateRule:
        "Accepted imports must preserve same-packet same-state determinism.",
      futureNativeBoundary:
        "Ledger import validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "portability_integrity_check",
      purpose:
        "Checks whether Mycelium packet data can move across device shells without losing ledger truth or deterministic derived state.",
      preferredOnLaptopDesktopBecause: [
        "portability checks can require larger packet windows",
        "integrity checks may be CPU-heavy",
        "phones should not be forced into archival verification",
      ],
      mustNotBecome: [
        "desktop-only ownership",
        "cloud-only portability",
        "non-Mycelium layer behavior",
      ],
      phoneSupportRole: [
        "participate in bounded portability awareness",
        "apply verified packet deltas",
        "defer full integrity checks",
      ],
      ledgerRule:
        "Portability must preserve packet-ledger truth across device shells.",
      deltaOnlyRule:
        "Portability should avoid repeated unchanged state and prefer verifiable packet windows.",
      deterministicStateRule:
        "Portable Mycelium state must be reproducible from the same valid packets.",
      futureNativeBoundary:
        "Portability integrity should eventually move behind native/WASM validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "phone_delta_preparation",
      purpose:
        "Prepares bounded packet, correction, tombstone, phrase, meaning, identity, settings, diagnostics, and ledger portability deltas that phone peers can safely consume.",
      preferredOnLaptopDesktopBecause: [
        "delta preparation may require larger source windows",
        "laptops/desktops can compress heavy reconciliation into bounded phone-safe updates",
        "phones should not need to compute every repair path themselves",
      ],
      mustNotBecome: [
        "server push authority",
        "cloud sync dependency",
        "phone thin-client design",
      ],
      phoneSupportRole: [
        "consume bounded deltas",
        "verify lightweight local safety",
        "resume sync using cursors",
        "preserve offline state",
      ],
      ledgerRule:
        "Prepared deltas must map back to valid packet-ledger data.",
      deltaOnlyRule:
        "Prepared phone updates must avoid repeated unchanged full-state transfer.",
      deterministicStateRule:
        "Applying valid prepared deltas should move the phone toward the same derived state as any other device with the same valid packets.",
      futureNativeBoundary:
        "Phone-safe delta preparation and verification should eventually move behind deterministic native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
