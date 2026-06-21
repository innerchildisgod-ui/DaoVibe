/**
 * DAOVibe / Mycelium sync repair planning boundary.
 *
 * Architecture-only.
 *
 * Commit 48 classified sync conflicts.
 * This boundary defines what kind of repair plan may be prepared after a
 * conflict is classified.
 *
 * This file does not repair state.
 * This file does not run sync.
 * This file does not discover peers.
 * This file does not perform networking, storage writes, scheduling, cloud sync,
 * mobile app behavior, desktop packaging, or native enforcement.
 *
 * The packet ledger remains the source of truth.
 */

export type MyceliumSyncRepairPlanningRuntimeStatus = "architecture_only";

export type MyceliumSyncRepairPlanName =
  | "request_missing_packets"
  | "ignore_duplicate_delivery"
  | "reject_invalid_packets"
  | "defer_expired_packet_review"
  | "repair_cursor_gap"
  | "review_packet_order"
  | "apply_tombstone_delta"
  | "defer_correction_contest_review"
  | "mark_weak_correction_provisional"
  | "rebuild_derived_phrase_state"
  | "rebuild_derived_meaning_state"
  | "review_identity_state"
  | "review_settings_state"
  | "prepare_diagnostics_summary"
  | "review_ledger_portability_integrity";

export type MyceliumSyncRepairPlanPreferredDevice =
  | "phone_allowed_when_bounded"
  | "laptop_desktop_preferred"
  | "must_defer_to_laptop_desktop";

export interface MyceliumSyncRepairPlanBoundary {
  readonly name: MyceliumSyncRepairPlanName;
  readonly purpose: string;
  readonly respondsToConflictTypes: readonly string[];
  readonly preferredDevice: MyceliumSyncRepairPlanPreferredDevice;
  readonly phoneAllowedWork: readonly string[];
  readonly phoneMustAvoid: readonly string[];
  readonly laptopDesktopResponsibilities: readonly string[];
  readonly repairPlanMayProduce: readonly string[];
  readonly repairPlanMustNotProduce: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSyncRepairPlanningRuntimeStatus;
}

export const MYCELIUM_SYNC_REPAIR_PLANNING_CORE_RULES = [
  "Repair planning is not repair execution.",
  "The packet ledger remains the source of truth.",
  "Repair plans must be derived from classified conflicts and valid packet-ledger evidence.",
  "Phones may participate in bounded repair planning but must avoid heavy repair review by default.",
  "Laptops/desktops are preferred for large-window review, diagnostics, replay, export/import integrity checks, and contested correction review.",
  "Repair plans should produce packet deltas, cursor repair windows, tombstone deltas, correction status summaries, diagnostics summaries, or phone-safe repair guidance.",
  "Repair plans must not produce cloud authority, non-ledger truth, repeated unchanged full-state sync, or silent deletion.",
  "Same valid packets must derive the same state on every device.",
  "Critical repair validation should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_SYNC_REPAIR_PLANNING_BOUNDARY: readonly MyceliumSyncRepairPlanBoundary[] =
  [
    {
      name: "request_missing_packets",
      purpose:
        "Plans bounded repair for missing packet conflicts by requesting the missing ledger packets or compact missing-packet windows.",
      respondsToConflictTypes: ["missing_packet", "cursor_gap", "derived_phrase_mismatch", "derived_meaning_mismatch"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "request small missing packet windows",
        "accept bounded missing packet deltas",
        "resume from a safe cursor",
      ],
      phoneMustAvoid: [
        "large missing packet scans",
        "full ledger replay by default",
        "treating derived state as source truth",
      ],
      laptopDesktopResponsibilities: [
        "compare larger packet windows",
        "prepare missing packet repair deltas",
        "audit missing packet ranges",
      ],
      repairPlanMayProduce: [
        "missing packet references",
        "bounded packet delta request",
        "cursor repair hint",
      ],
      repairPlanMustNotProduce: [
        "invented packets",
        "repeated unchanged full state",
        "cloud-owned repair truth",
      ],
      ledgerRule:
        "Missing packet repair planning must converge toward valid packet-ledger state.",
      deltaOnlyRule:
        "The repair plan should request missing packet deltas, not repeated full derived state.",
      deterministicStateRule:
        "Once missing valid packets are restored, derived state should converge under the same rules.",
      futureNativeBoundary:
        "Missing packet repair validation should eventually move behind Rust/WASM/native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ignore_duplicate_delivery",
      purpose:
        "Plans idempotent handling for duplicate packet delivery without counting the same packet as new truth.",
      respondsToConflictTypes: ["duplicate_packet"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "ignore already-known packet IDs",
        "continue from the next safe cursor",
        "preserve local derived state without duplicate influence",
      ],
      phoneMustAvoid: [
        "counting duplicates as additional votes",
        "creating new correction or meaning authority from duplicate delivery",
        "broadcasting unchanged state as a workaround",
      ],
      laptopDesktopResponsibilities: [
        "audit large duplicate patterns",
        "diagnose unexpected packet ID collisions",
        "prepare compact duplicate summaries",
      ],
      repairPlanMayProduce: [
        "duplicate ignored summary",
        "safe cursor continuation hint",
      ],
      repairPlanMustNotProduce: [
        "new ledger truth",
        "extra meaning score",
        "extra correction vote weight",
      ],
      ledgerRule:
        "Duplicate delivery must not create duplicate packet-ledger truth.",
      deltaOnlyRule:
        "Duplicate handling should rely on packet identity and cursors, not full-state retransmission.",
      deterministicStateRule:
        "Idempotent packet handling must preserve same-valid-packets to same-derived-state.",
      futureNativeBoundary:
        "Duplicate packet identity checks should eventually move behind native packet validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "reject_invalid_packets",
      purpose:
        "Plans safe rejection or quarantine guidance for invalid packet conflicts before they affect derived state.",
      respondsToConflictTypes: ["invalid_packet"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "reject a small invalid packet locally",
        "surface a bounded local error",
        "avoid deriving state from invalid input",
      ],
      phoneMustAvoid: [
        "repairing malformed packets by guessing",
        "accepting invalid packets for convenience",
        "running large invalid packet audits",
      ],
      laptopDesktopResponsibilities: [
        "review invalid packet batches",
        "diagnose malformed packet patterns",
        "prepare compact invalid-packet summaries",
      ],
      repairPlanMayProduce: [
        "invalid packet rejection summary",
        "quarantine recommendation",
        "diagnostic hint",
      ],
      repairPlanMustNotProduce: [
        "silently rewritten packets",
        "accepted invalid ledger entries",
        "derived state from invalid data",
      ],
      ledgerRule:
        "Invalid packets must not become accepted ledger truth.",
      deltaOnlyRule:
        "Invalid packet planning should produce compact diagnostics, not repeated full-state sync.",
      deterministicStateRule:
        "Devices using the same policy must reject invalid packets consistently.",
      futureNativeBoundary:
        "Invalid packet validation and quarantine should eventually move behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "defer_expired_packet_review",
      purpose:
        "Plans bounded handling for expired packets without silently erasing ledger history.",
      respondsToConflictTypes: ["expired_packet"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "avoid applying expired packets to active local state",
        "accept bounded tombstone or cleanup deltas",
        "surface local stale-state warning",
      ],
      phoneMustAvoid: [
        "large expiry cleanup scans",
        "silent ledger deletion",
        "resurrecting expired active state",
      ],
      laptopDesktopResponsibilities: [
        "review larger expiry windows",
        "audit cleanup candidates",
        "prepare bounded cleanup guidance",
      ],
      repairPlanMayProduce: [
        "expired packet summary",
        "cleanup review hint",
        "bounded tombstone request",
      ],
      repairPlanMustNotProduce: [
        "silent erasure",
        "non-ledger deletion authority",
        "full repeated active state",
      ],
      ledgerRule:
        "Expiry may affect active derived state but must not erase packet-ledger truth.",
      deltaOnlyRule:
        "Expiry handling should move tombstone, cleanup, or compact review deltas.",
      deterministicStateRule:
        "Same valid packets and expiry rules must derive the same active or inactive state.",
      futureNativeBoundary:
        "Expiry and cleanup validation should eventually move behind native lifecycle boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "repair_cursor_gap",
      purpose:
        "Plans cursor-gap repair by requesting bounded packet windows rather than treating the cursor as truth.",
      respondsToConflictTypes: ["cursor_gap", "missing_packet", "packet_order_gap"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "request a bounded earlier packet window",
        "resume from a safe known cursor",
        "surface a local cursor warning",
      ],
      phoneMustAvoid: [
        "treating cursor as source truth",
        "forcing full ledger replay by default",
        "skipping packet validation",
      ],
      laptopDesktopResponsibilities: [
        "compare larger cursor windows",
        "prepare packet-window repair guidance",
        "audit cursor gaps",
      ],
      repairPlanMayProduce: [
        "safe cursor fallback hint",
        "bounded packet window request",
        "cursor mismatch summary",
      ],
      repairPlanMustNotProduce: [
        "cloud checkpoint authority",
        "non-ledger truth",
        "repeated unchanged full state",
      ],
      ledgerRule:
        "Cursor gaps must be resolved against valid packet-ledger data.",
      deltaOnlyRule:
        "Cursor repair should request bounded packet windows, not repeated unchanged state.",
      deterministicStateRule:
        "After cursor repair, the same valid packets should produce the same derived state.",
      futureNativeBoundary:
        "Cursor repair validation should eventually move behind Rust/WASM/native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "review_packet_order",
      purpose:
        "Plans review for packet ordering uncertainty where replay order may affect derived state.",
      respondsToConflictTypes: ["packet_order_gap"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "preserve stable local ordering rules",
        "apply only safe bounded packet windows",
        "defer large ordering review",
      ],
      phoneMustAvoid: [
        "deriving unstable state from arbitrary arrival order",
        "overriding ledger order with device preference",
        "hiding ordering uncertainty",
      ],
      laptopDesktopResponsibilities: [
        "review larger replay windows",
        "prepare ordering summaries",
        "diagnose order-sensitive derived-state drift",
      ],
      repairPlanMayProduce: [
        "ordering review summary",
        "stable replay hint",
        "bounded packet-window request",
      ],
      repairPlanMustNotProduce: [
        "manual override of packet order",
        "device preference as truth",
        "runtime replay execution from this boundary",
      ],
      ledgerRule:
        "Ordering repair planning must preserve packet-ledger truth and stable replay rules.",
      deltaOnlyRule:
        "Ordering repair should move compact ordering hints or bounded packet windows.",
      deterministicStateRule:
        "Replay order must be deterministic where order affects derived state.",
      futureNativeBoundary:
        "Packet ordering and replay safety should eventually move behind native deterministic replay boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "apply_tombstone_delta",
      purpose:
        "Plans bounded tombstone repair so deleted, expired, or inactive state is not resurrected across devices.",
      respondsToConflictTypes: ["tombstone_conflict", "expired_packet"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "accept tombstone deltas",
        "avoid resurrecting tombstoned state",
        "surface local inactive-state warning",
      ],
      phoneMustAvoid: [
        "large tombstone audits",
        "silent ledger erasure",
        "non-ledger deletion authority",
      ],
      laptopDesktopResponsibilities: [
        "audit larger tombstone windows",
        "review cleanup candidates",
        "prepare bounded tombstone deltas",
      ],
      repairPlanMayProduce: [
        "tombstone delta request",
        "inactive-state summary",
        "cleanup review hint",
      ],
      repairPlanMustNotProduce: [
        "silent deletion",
        "hidden ledger rewrite",
        "full cleanup-state broadcast",
      ],
      ledgerRule:
        "Tombstone repair planning must resolve through tombstone and related ledger packets.",
      deltaOnlyRule:
        "Tombstone repair should move tombstone deltas and compact audit summaries.",
      deterministicStateRule:
        "The same valid packet and tombstone set must derive the same active or inactive state.",
      futureNativeBoundary:
        "Tombstone repair validation should eventually move behind native lifecycle and integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "defer_correction_contest_review",
      purpose:
        "Plans safe deferral for contested correction state that requires larger vote, proposal, reject, or tombstone review.",
      respondsToConflictTypes: ["correction_contest", "weak_correction_authority", "derived_meaning_mismatch"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "show bounded contested status",
        "accept correction proposal and vote deltas",
        "avoid finalizing contested state",
      ],
      phoneMustAvoid: [
        "treating one weak vote as final truth",
        "collapsing contested status into confirmed status",
        "running large correction history scans",
      ],
      laptopDesktopResponsibilities: [
        "review correction vote windows",
        "audit contested correction state",
        "prepare compact correction review summaries",
      ],
      repairPlanMayProduce: [
        "contested correction summary",
        "correction delta request",
        "defer-to-review hint",
      ],
      repairPlanMustNotProduce: [
        "single-vote final authority",
        "non-ledger correction truth",
        "hidden contested-state collapse",
      ],
      ledgerRule:
        "Correction contest planning must be explained by correction proposal, vote, reject, and tombstone packets.",
      deltaOnlyRule:
        "Correction repair should move correction deltas and compact status summaries.",
      deterministicStateRule:
        "Correction status must be reproducible from the same valid correction packet set and policy rules.",
      futureNativeBoundary:
        "Correction contest repair validation should eventually move behind native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "mark_weak_correction_provisional",
      purpose:
        "Plans provisional handling for correction-derived state that is too weak to become final authority.",
      respondsToConflictTypes: ["weak_correction_authority"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "display provisional correction status",
        "request bounded correction deltas",
        "avoid finalizing weak authority",
      ],
      phoneMustAvoid: [
        "using absence of rejects as final authority by itself",
        "treating one confirm as confirmed truth",
        "hiding provisional state",
      ],
      laptopDesktopResponsibilities: [
        "review correction threshold evidence",
        "audit incomplete correction windows",
        "prepare compact provisional-state summaries",
      ],
      repairPlanMayProduce: [
        "provisional correction marker",
        "correction packet request",
        "threshold review hint",
      ],
      repairPlanMustNotProduce: [
        "confirmed status without enough policy support",
        "manual correction authority",
        "derived state outside packet evidence",
      ],
      ledgerRule:
        "Correction authority must come from valid correction-related ledger packets and policy thresholds.",
      deltaOnlyRule:
        "Weak correction review should move correction deltas or compact status summaries.",
      deterministicStateRule:
        "All devices with the same correction packets and policy must classify weak authority the same way.",
      futureNativeBoundary:
        "Correction threshold enforcement should eventually move behind native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "rebuild_derived_phrase_state",
      purpose:
        "Plans phrase-derived state rebuild from valid packets when phrase state mismatches across devices.",
      respondsToConflictTypes: ["derived_phrase_mismatch", "missing_packet", "packet_order_gap"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "report bounded phrase summary",
        "accept phrase packet deltas",
        "perform small local phrase refresh",
      ],
      phoneMustAvoid: [
        "full phrase index rebuild by default",
        "treating phrase index as source truth",
        "broadcasting unchanged phrase state",
      ],
      laptopDesktopResponsibilities: [
        "rebuild phrase indexes from valid packets",
        "compare phrase-derived state",
        "prepare bounded phrase repair summaries",
      ],
      repairPlanMayProduce: [
        "phrase packet request",
        "phrase rebuild summary",
        "bounded phrase delta guidance",
      ],
      repairPlanMustNotProduce: [
        "manual phrase truth outside packets",
        "cloud phrase authority",
        "repeated full phrase state",
      ],
      ledgerRule:
        "Phrase state must be derived from valid phrase-related packets.",
      deltaOnlyRule:
        "Phrase repair should move missing phrase packets or compact rebuild summaries.",
      deterministicStateRule:
        "Same valid phrase packets must derive the same phrase state.",
      futureNativeBoundary:
        "Phrase derivation and index validation should eventually move behind native indexing boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "rebuild_derived_meaning_state",
      purpose:
        "Plans meaning-derived state rebuild from valid meaning, vote, correction, and tombstone packets.",
      respondsToConflictTypes: ["derived_meaning_mismatch", "correction_contest", "weak_correction_authority"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "report bounded meaning summary",
        "accept meaning and correction deltas",
        "defer heavy scoring review",
      ],
      phoneMustAvoid: [
        "heavy meaning scoring audits",
        "treating local meaning index as source truth",
        "finalizing meaning outside valid packets and policy",
      ],
      laptopDesktopResponsibilities: [
        "rebuild meaning indexes from valid packets",
        "review scoring policy effects",
        "prepare compact meaning repair summaries",
      ],
      repairPlanMayProduce: [
        "meaning packet request",
        "correction delta request",
        "meaning rebuild summary",
      ],
      repairPlanMustNotProduce: [
        "manual meaning authority",
        "repeated unchanged meaning state",
        "non-ledger meaning truth",
      ],
      ledgerRule:
        "Meaning state must be derived from valid meaning, vote, correction, and tombstone packets.",
      deltaOnlyRule:
        "Meaning repair should move missing packets, correction deltas, or compact scoring summaries.",
      deterministicStateRule:
        "Same valid packets and scoring policy must derive the same meaning state.",
      futureNativeBoundary:
        "Meaning scoring and deterministic derivation should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "review_identity_state",
      purpose:
        "Plans bounded identity-state review without requiring cloud identity ownership.",
      respondsToConflictTypes: ["identity_state_mismatch"],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "hold bounded local identity state",
        "request bounded identity deltas",
        "surface local identity warning",
      ],
      phoneMustAvoid: [
        "large identity graph review",
        "cloud identity fallback",
        "device preference overriding packet-backed identity state",
      ],
      laptopDesktopResponsibilities: [
        "review identity consistency",
        "prepare bounded identity repair summaries",
        "diagnose portable identity mismatch",
      ],
      repairPlanMayProduce: [
        "identity delta request",
        "identity mismatch summary",
        "consistency review hint",
      ],
      repairPlanMustNotProduce: [
        "cloud-owned identity authority",
        "non-ledger identity override",
        "repeated unchanged identity state",
      ],
      ledgerRule:
        "Identity state must remain tied to ledger-backed identity or device events where represented in Mycelium.",
      deltaOnlyRule:
        "Identity repair should move changed identity events or compact mismatch summaries.",
      deterministicStateRule:
        "Same valid identity packets and policy must derive the same identity state.",
      futureNativeBoundary:
        "Identity conflict validation should eventually move behind native identity-safety boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "review_settings_state",
      purpose:
        "Plans bounded settings-state review without repeatedly broadcasting unchanged settings.",
      respondsToConflictTypes: ["settings_state_mismatch"],
      preferredDevice: "phone_allowed_when_bounded",
      phoneAllowedWork: [
        "hold local settings for offline use",
        "accept bounded settings deltas",
        "surface local settings conflict warning",
      ],
      phoneMustAvoid: [
        "broadcasting unchanged settings repeatedly",
        "silently overriding packet-backed settings",
        "requiring cloud settings ownership",
      ],
      laptopDesktopResponsibilities: [
        "review multi-device settings conflicts",
        "prepare portability summaries",
        "diagnose policy mismatch",
      ],
      repairPlanMayProduce: [
        "settings delta request",
        "settings conflict summary",
        "policy mismatch hint",
      ],
      repairPlanMustNotProduce: [
        "cloud settings authority",
        "device preference as silent truth",
        "repeated full settings state",
      ],
      ledgerRule:
        "Where settings are represented as packets, settings state must resolve through valid settings events and policy.",
      deltaOnlyRule:
        "Settings repair should move changed settings events or compact conflict summaries.",
      deterministicStateRule:
        "Same valid settings packets and policy should derive the same settings state.",
      futureNativeBoundary:
        "Settings conflict policy should eventually move behind native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "prepare_diagnostics_summary",
      purpose:
        "Plans compact diagnostics summaries that explain mismatch without making diagnostics the source of truth.",
      respondsToConflictTypes: [
        "diagnostics_mismatch",
        "missing_packet",
        "cursor_gap",
        "derived_phrase_mismatch",
        "derived_meaning_mismatch",
      ],
      preferredDevice: "laptop_desktop_preferred",
      phoneAllowedWork: [
        "show lightweight diagnostics",
        "report bounded local sync health",
        "surface local repair hints",
      ],
      phoneMustAvoid: [
        "full diagnostics scans by default",
        "diagnostics as alternate truth",
        "heavy background diagnostics",
      ],
      laptopDesktopResponsibilities: [
        "run deeper diagnostics",
        "compare larger packet windows",
        "prepare compact repair guidance",
      ],
      repairPlanMayProduce: [
        "diagnostics summary",
        "repair hint",
        "bounded mismatch explanation",
      ],
      repairPlanMustNotProduce: [
        "packet-ledger override",
        "full repeated diagnostic state",
        "cloud telemetry requirement",
      ],
      ledgerRule:
        "Diagnostics may explain ledger-derived state but must not override the packet ledger.",
      deltaOnlyRule:
        "Diagnostics repair planning should move compact summaries, not repeated unchanged diagnostics.",
      deterministicStateRule:
        "Diagnostic claims should be traceable to packet windows, policy versions, or derivation behavior.",
      futureNativeBoundary:
        "Diagnostic validation should eventually move behind native audit boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "review_ledger_portability_integrity",
      purpose:
        "Plans export/import or portable packet-window integrity review without implementing export/import runtime behavior.",
      respondsToConflictTypes: ["ledger_portability_mismatch"],
      preferredDevice: "must_defer_to_laptop_desktop",
      phoneAllowedWork: [
        "show bounded portability warning",
        "verify small local imports where policy allows",
        "defer full integrity review",
      ],
      phoneMustAvoid: [
        "large full-ledger export/import by default",
        "bulk integrity verification",
        "trusting portable archives without packet validation",
      ],
      laptopDesktopResponsibilities: [
        "review larger portable packet windows",
        "perform bulk integrity checks",
        "prepare bounded phone-safe portability summaries",
      ],
      repairPlanMayProduce: [
        "portability integrity summary",
        "import/export review hint",
        "bounded packet-window request",
      ],
      repairPlanMustNotProduce: [
        "non-Mycelium layer behavior",
        "payment or marketplace behavior",
        "trusted portable state without validation",
      ],
      ledgerRule:
        "Ledger portability must preserve packet-ledger truth and deterministic replay safety.",
      deltaOnlyRule:
        "Portability repair should move verifiable packet windows and compact integrity summaries.",
      deterministicStateRule:
        "Accepted portable packets must replay into the same derived Mycelium state under the same rules.",
      futureNativeBoundary:
        "Ledger portability validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
