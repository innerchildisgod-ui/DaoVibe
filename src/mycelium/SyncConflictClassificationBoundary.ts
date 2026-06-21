/**
 * DAOVibe / Mycelium sync conflict classification boundary.
 *
 * Architecture-only.
 *
 * This file defines how Mycelium should classify sync conflicts before any
 * runtime repair, reconciliation, peer discovery, networking, scheduling,
 * mobile shell, desktop packaging, cloud sync, or native enforcement exists.
 *
 * Classification is not repair.
 * Classification is not authority.
 * Classification is not consensus.
 *
 * The packet ledger remains the source of truth. A conflict classification
 * should help future synchronizers explain why devices disagree while preserving
 * same-valid-packets -> same-derived-state.
 */

export type MyceliumSyncConflictRuntimeStatus = "architecture_only";

export type MyceliumSyncConflictSeverity =
  | "informational"
  | "recoverable"
  | "requires_review"
  | "must_defer_to_laptop_desktop";

export type MyceliumSyncConflictName =
  | "missing_packet"
  | "duplicate_packet"
  | "invalid_packet"
  | "expired_packet"
  | "cursor_gap"
  | "packet_order_gap"
  | "tombstone_conflict"
  | "correction_contest"
  | "weak_correction_authority"
  | "derived_phrase_mismatch"
  | "derived_meaning_mismatch"
  | "identity_state_mismatch"
  | "settings_state_mismatch"
  | "diagnostics_mismatch"
  | "ledger_portability_mismatch";

export interface MyceliumSyncConflictClassification {
  readonly name: MyceliumSyncConflictName;
  readonly severity: MyceliumSyncConflictSeverity;
  readonly purpose: string;
  readonly likelyCause: readonly string[];
  readonly mayBeHandledByPhone: readonly string[];
  readonly shouldDeferToLaptopDesktopWhen: readonly string[];
  readonly mustNotDo: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSyncConflictRuntimeStatus;
}

export const MYCELIUM_SYNC_CONFLICT_CLASSIFICATION_CORE_RULES = [
  "Conflict classification is architecture-only and does not repair state.",
  "The packet ledger remains the source of truth.",
  "A cursor is a resume boundary, not a source of truth.",
  "A packet window is a bounded ledger view, not an alternate ledger.",
  "Phones may classify bounded local conflicts but should defer heavy review.",
  "Laptops/desktops are preferred for large-window conflict review and reconciliation planning.",
  "Classification must not silently erase packets, tombstones, corrections, identity state, or settings state.",
  "Repeated unchanged state must not be transmitted as a conflict repair strategy.",
  "Same valid packets must derive the same state on every device.",
  "Critical conflict validation and repair should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_SYNC_CONFLICT_CLASSIFICATION_BOUNDARY: readonly MyceliumSyncConflictClassification[] =
  [
    {
      name: "missing_packet",
      severity: "recoverable",
      purpose:
        "Classifies a gap where one device has not received packet data that another device references or already holds.",
      likelyCause: [
        "cursor resumed after an incomplete packet window",
        "device was offline",
        "bounded phone sync skipped a larger packet window",
        "import/export window did not include all expected packets",
      ],
      mayBeHandledByPhone: [
        "report bounded missing packet references",
        "accept small missing-packet deltas",
        "resume from a safe cursor",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "many packets are missing",
        "missing range is old or large",
        "derived state mismatch depends on the missing packets",
      ],
      mustNotDo: [
        "invent replacement packets",
        "treat derived state as source truth",
        "request repeated unchanged full state",
      ],
      ledgerRule:
        "Missing packet repair must converge toward valid packet-ledger state.",
      deltaOnlyRule:
        "Repair should move missing packet deltas or compact missing references, not repeated full state.",
      deterministicStateRule:
        "Once missing valid packets are restored, derived state should converge under the same rules.",
      futureNativeBoundary:
        "Missing packet validation and repair should eventually move behind Rust/WASM/native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "duplicate_packet",
      severity: "recoverable",
      purpose:
        "Classifies repeated packet delivery where the same packet is seen more than once.",
      likelyCause: [
        "safe retry",
        "cursor overlap",
        "sync window overlap",
        "device restarted and resent already-known packets",
      ],
      mayBeHandledByPhone: [
        "ignore already-known packet IDs",
        "preserve idempotent local state",
        "continue from the next safe cursor",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "duplicate pattern suggests corruption",
        "many packet IDs collide unexpectedly",
        "diagnostics need a larger packet window",
      ],
      mustNotDo: [
        "count duplicate packets as new truth",
        "increase correction or meaning authority from duplicate delivery",
        "broadcast unchanged state as a workaround",
      ],
      ledgerRule:
        "Duplicate delivery must not create duplicate ledger truth.",
      deltaOnlyRule:
        "Duplicate handling should rely on packet identity/cursors rather than full-state retransmission.",
      deterministicStateRule:
        "Idempotent packet handling must preserve same-valid-packets -> same-derived-state.",
      futureNativeBoundary:
        "Duplicate packet detection should eventually move behind native packet identity validation.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "invalid_packet",
      severity: "requires_review",
      purpose:
        "Classifies packet data that fails validation or cannot safely contribute to derived Mycelium state.",
      likelyCause: [
        "corrupted packet data",
        "malformed packet fields",
        "unsupported packet shape",
        "future signature/hash validation failure",
      ],
      mayBeHandledByPhone: [
        "reject bounded invalid packet input",
        "surface local error",
        "avoid deriving state from the invalid packet",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "invalid packet appears inside a large import",
        "many invalid packets appear together",
        "audit-level review is needed",
      ],
      mustNotDo: [
        "derive state from invalid packets",
        "silently rewrite invalid packets into valid ones",
        "treat diagnostics as source truth",
      ],
      ledgerRule:
        "Invalid packets must not become accepted ledger truth.",
      deltaOnlyRule:
        "Invalid packet reports should be compact diagnostics, not repeated full-state sync.",
      deterministicStateRule:
        "Devices must not diverge by accepting invalid packets differently under the same policy.",
      futureNativeBoundary:
        "Invalid packet validation should eventually move behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "expired_packet",
      severity: "recoverable",
      purpose:
        "Classifies packets that are structurally recognizable but no longer valid for active derived state because of expiry policy.",
      likelyCause: [
        "old packet window",
        "delayed sync",
        "expiry policy applied after offline use",
        "cleanup boundary encountered stale state",
      ],
      mayBeHandledByPhone: [
        "avoid applying expired packets to active state",
        "keep bounded local awareness where needed",
        "accept tombstone or cleanup deltas",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "large expiry cleanup is needed",
        "old packet windows require audit",
        "derived state depends on many expired packets",
      ],
      mustNotDo: [
        "silently erase ledger history",
        "resurrect expired active state",
        "broadcast full derived state as cleanup",
      ],
      ledgerRule:
        "Expiry may affect active derived state but must not erase packet-ledger truth.",
      deltaOnlyRule:
        "Expiry handling should move tombstone/cleanup deltas or compact summaries.",
      deterministicStateRule:
        "The same valid packets and expiry rules must derive the same active/inactive state.",
      futureNativeBoundary:
        "Expiry and cleanup validation should eventually move behind native lifecycle boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "cursor_gap",
      severity: "recoverable",
      purpose:
        "Classifies a sync resume position that does not cleanly connect to the expected packet window.",
      likelyCause: [
        "device resumed from stale cursor",
        "packet window was compacted",
        "phone skipped a larger sync window",
        "import/export boundary did not preserve expected cursor metadata",
      ],
      mayBeHandledByPhone: [
        "request a bounded repair window",
        "fall back to a safe earlier cursor when policy allows",
        "surface a local sync warning",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "cursor gap spans many packets",
        "deep packet-window comparison is needed",
        "derived state mismatch is present",
      ],
      mustNotDo: [
        "treat cursor as source truth",
        "skip required packet validation",
        "force full-state retransmission by default",
      ],
      ledgerRule:
        "Cursor gaps must be resolved against packet-ledger data.",
      deltaOnlyRule:
        "Cursor repair should request bounded packet windows, not repeated unchanged state.",
      deterministicStateRule:
        "After cursor repair, the same valid packets should produce the same derived state.",
      futureNativeBoundary:
        "Cursor safety should eventually move behind Rust/WASM/native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "packet_order_gap",
      severity: "requires_review",
      purpose:
        "Classifies uncertainty about packet ordering, received order, or replay order inside a bounded window.",
      likelyCause: [
        "out-of-order delivery",
        "imported packet window lacks ordering hints",
        "device restarted during sync",
        "different devices received packet batches in different order",
      ],
      mayBeHandledByPhone: [
        "preserve stable local ordering rules",
        "defer larger ordering review",
        "apply only safe bounded packet windows",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "ordering affects derived state",
        "large replay window is required",
        "diagnostic comparison is needed",
      ],
      mustNotDo: [
        "derive unstable state from arbitrary arrival order",
        "override ledger order with device preference",
        "hide ordering uncertainty",
      ],
      ledgerRule:
        "Ordering review must preserve packet-ledger truth and stable replay rules.",
      deltaOnlyRule:
        "Ordering repair should move compact ordering hints or bounded packet windows.",
      deterministicStateRule:
        "Replay order must be deterministic where order affects derived state.",
      futureNativeBoundary:
        "Packet ordering and replay safety should eventually move behind native deterministic replay boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "tombstone_conflict",
      severity: "requires_review",
      purpose:
        "Classifies disagreement about whether a packet-derived item is active, expired, deleted, or tombstoned.",
      likelyCause: [
        "one device missed a tombstone packet",
        "cleanup candidate was reviewed on only one device",
        "old state was restored from an incomplete import",
        "phone did not receive tombstone delta yet",
      ],
      mayBeHandledByPhone: [
        "accept bounded tombstone deltas",
        "avoid resurrecting tombstoned state",
        "surface local inactive-state warning",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "large tombstone audit is needed",
        "cleanup history spans many packets",
        "import/export may resurrect stale state",
      ],
      mustNotDo: [
        "silently erase ledger truth",
        "resurrect tombstoned state without packet review",
        "treat deletion as non-ledger authority",
      ],
      ledgerRule:
        "Tombstone conflicts must resolve through tombstone and related ledger packets.",
      deltaOnlyRule:
        "Tombstone repair should move tombstone deltas and compact audit summaries.",
      deterministicStateRule:
        "The same valid packet and tombstone set must derive the same active/inactive state.",
      futureNativeBoundary:
        "Tombstone conflict review should eventually move behind native lifecycle/integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "correction_contest",
      severity: "requires_review",
      purpose:
        "Classifies correction state where proposals, votes, rejects, or tombstones produce contested meaning correction status.",
      likelyCause: [
        "competing correction proposals",
        "confirm/reject vote disagreement",
        "one device missed correction votes",
        "correction tombstone changed active status",
      ],
      mayBeHandledByPhone: [
        "show bounded contested status",
        "accept correction proposal and vote deltas",
        "defer full contest review",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "many correction packets are involved",
        "vote history needs audit",
        "meaning state depends on contested correction",
      ],
      mustNotDo: [
        "treat one weak vote as final truth",
        "hide contested correction state",
        "derive final authority outside correction packets",
      ],
      ledgerRule:
        "Correction contests must be explained by correction proposal, vote, reject, and tombstone packets.",
      deltaOnlyRule:
        "Correction contest sync should move correction deltas and compact status summaries.",
      deterministicStateRule:
        "Correction status must be reproducible from the same valid correction packet set and policy rules.",
      futureNativeBoundary:
        "Correction contest validation should eventually move behind native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "weak_correction_authority",
      severity: "requires_review",
      purpose:
        "Classifies correction-derived state that appears too weak to be treated as final authority.",
      likelyCause: [
        "single confirm vote",
        "no reject votes but insufficient confirmation",
        "local-only correction view",
        "incomplete correction packet window",
      ],
      mayBeHandledByPhone: [
        "display provisional status",
        "avoid finalizing weak correction state",
        "request bounded correction deltas",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "correction history is incomplete",
        "phrase/meaning state depends on the correction",
        "contested review is needed",
      ],
      mustNotDo: [
        "mark weak correction as final truth",
        "use absence of rejects as enough authority by itself",
        "collapse contested state into confirmed state",
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
      name: "derived_phrase_mismatch",
      severity: "requires_review",
      purpose:
        "Classifies disagreement in phrase-derived state even when devices believe they have synced.",
      likelyCause: [
        "missing phrase packet",
        "different packet window",
        "index rebuild drift",
        "policy version mismatch",
      ],
      mayBeHandledByPhone: [
        "report bounded phrase summary",
        "accept phrase packet deltas",
        "defer full index rebuild",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "large phrase index review is needed",
        "many phrase packets are involved",
        "deterministic rebuild comparison is required",
      ],
      mustNotDo: [
        "treat phrase index as source truth",
        "broadcast full unchanged phrase state",
        "override packet-derived phrase state manually",
      ],
      ledgerRule:
        "Phrase state must be derived from valid phrase-related packets.",
      deltaOnlyRule:
        "Phrase mismatch repair should move missing phrase packets or compact rebuild summaries.",
      deterministicStateRule:
        "Same valid phrase packets must derive the same phrase state.",
      futureNativeBoundary:
        "Phrase derivation and index validation should eventually move behind native indexing boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "derived_meaning_mismatch",
      severity: "requires_review",
      purpose:
        "Classifies disagreement in meaning-derived state, including scoring or best-meaning selection drift.",
      likelyCause: [
        "missing meaning proposal or vote packet",
        "correction packet mismatch",
        "different scoring policy version",
        "index rebuild drift",
      ],
      mayBeHandledByPhone: [
        "report bounded meaning summary",
        "accept meaning/correction deltas",
        "defer heavy scoring review",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "meaning scoring audit is needed",
        "many meaning packets are involved",
        "correction state affects meaning result",
      ],
      mustNotDo: [
        "treat local meaning index as source truth",
        "broadcast repeated unchanged meaning state",
        "finalize meaning outside valid packets and policy",
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
      name: "identity_state_mismatch",
      severity: "requires_review",
      purpose:
        "Classifies disagreement in local device/identity-derived state without requiring cloud identity ownership.",
      likelyCause: [
        "missing identity packet",
        "device state changed offline",
        "bounded phone identity window is incomplete",
        "identity policy version mismatch",
      ],
      mayBeHandledByPhone: [
        "hold bounded local identity state",
        "request bounded identity deltas",
        "surface local identity warning",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "identity graph review is large",
        "device consistency audit is needed",
        "portable identity review is required",
      ],
      mustNotDo: [
        "require cloud identity ownership",
        "override ledger-backed identity state with device preference",
        "broadcast unchanged identity state repeatedly",
      ],
      ledgerRule:
        "Identity state must remain tied to ledger-backed identity/device events where represented in Mycelium.",
      deltaOnlyRule:
        "Identity repair should move changed identity events or compact mismatch summaries.",
      deterministicStateRule:
        "Same valid identity packets and policy must derive the same identity state.",
      futureNativeBoundary:
        "Identity conflict validation should eventually move behind native identity-safety boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "settings_state_mismatch",
      severity: "recoverable",
      purpose:
        "Classifies disagreement in settings-derived state without treating unchanged settings as something to rebroadcast.",
      likelyCause: [
        "one device missed a settings change packet",
        "offline settings update",
        "settings conflict policy mismatch",
        "portable settings window incomplete",
      ],
      mayBeHandledByPhone: [
        "hold local settings for offline use",
        "accept bounded settings deltas",
        "surface local conflict warning",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "settings conflict spans multiple devices",
        "portability review is needed",
        "policy mismatch needs diagnostics",
      ],
      mustNotDo: [
        "broadcast unchanged settings repeatedly",
        "let device preference silently override ledger-backed changes",
        "require cloud settings ownership",
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
      name: "diagnostics_mismatch",
      severity: "informational",
      purpose:
        "Classifies disagreement between diagnostic summaries without making diagnostics a source of truth.",
      likelyCause: [
        "different packet windows",
        "different diagnostic policy version",
        "phone reported bounded summary only",
        "laptop/desktop ran deeper diagnostics",
      ],
      mayBeHandledByPhone: [
        "report lightweight diagnostics",
        "show bounded local sync health",
        "defer full scan",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "full diagnostics are needed",
        "large packet windows must be inspected",
        "repair planning depends on diagnostics",
      ],
      mustNotDo: [
        "treat diagnostics as packet-ledger truth",
        "force heavy diagnostics on phones by default",
        "broadcast unchanged diagnostics repeatedly",
      ],
      ledgerRule:
        "Diagnostics may explain ledger-derived state but must not override the packet ledger.",
      deltaOnlyRule:
        "Diagnostics mismatch repair should move compact summaries, not full repeated diagnostics.",
      deterministicStateRule:
        "Diagnostic claims should be traceable to packet windows, policy versions, or derivation behavior.",
      futureNativeBoundary:
        "Diagnostic validation should eventually move behind native audit boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ledger_portability_mismatch",
      severity: "must_defer_to_laptop_desktop",
      purpose:
        "Classifies export/import or portable packet-window mismatch without implementing export/import runtime behavior.",
      likelyCause: [
        "portable packet window incomplete",
        "imported packet window failed validation",
        "export summary does not match packet content",
        "device shell policy mismatch",
      ],
      mayBeHandledByPhone: [
        "show bounded portability warning",
        "verify small local imports where policy allows",
        "defer full integrity review",
      ],
      shouldDeferToLaptopDesktopWhen: [
        "full export/import review is needed",
        "bulk integrity verification is required",
        "large packet windows are involved",
      ],
      mustNotDo: [
        "implement currency behavior",
        "implement payment behavior",
        "implement marketplace behavior",
        "treat portable archive as trusted without packet validation",
      ],
      ledgerRule:
        "Ledger portability must preserve packet-ledger truth and deterministic replay safety.",
      deltaOnlyRule:
        "Portability mismatch review should move verifiable packet windows and compact integrity summaries.",
      deterministicStateRule:
        "Accepted portable packets must replay into the same derived Mycelium state under the same rules.",
      futureNativeBoundary:
        "Ledger portability validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
