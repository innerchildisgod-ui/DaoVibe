/**
 * DAOVibe / Mycelium deterministic state convergence boundary.
 *
 * Architecture-only.
 *
 * This boundary defines the convergence rule Mycelium must preserve:
 *
 * same valid packets + compatible policy rules = same derived state
 *
 * This file does not run sync, repair state, scan packets, discover peers,
 * perform networking, write storage, schedule work, implement mobile behavior,
 * implement desktop packaging, use cloud sync, or enforce native rules.
 *
 * The packet ledger remains the source of truth.
 */

export type MyceliumDeterministicConvergenceRuntimeStatus = "architecture_only";

export type MyceliumDerivedStateArea =
  | "packet_acceptance"
  | "phrase_state"
  | "meaning_state"
  | "correction_state"
  | "tombstone_state"
  | "identity_state"
  | "settings_state"
  | "diagnostics_state"
  | "ledger_portability_state";

export type MyceliumConvergenceRisk =
  | "low"
  | "moderate"
  | "high"
  | "must_explain_before_repair";

export interface MyceliumDeterministicStateConvergenceRule {
  readonly area: MyceliumDerivedStateArea;
  readonly purpose: string;
  readonly convergenceRisk: MyceliumConvergenceRisk;
  readonly requiredInputs: readonly string[];
  readonly mismatchCauses: readonly string[];
  readonly phoneRole: readonly string[];
  readonly laptopDesktopRole: readonly string[];
  readonly mustNeverDo: readonly string[];
  readonly ledgerRule: string;
  readonly policyCompatibilityRule: string;
  readonly deltaOnlyRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumDeterministicConvergenceRuntimeStatus;
}

export const MYCELIUM_DETERMINISTIC_STATE_CONVERGENCE_CORE_RULES = [
  "The packet ledger remains the source of truth.",
  "Same valid packets plus compatible policy rules must derive the same state.",
  "Same packets alone are not enough if policy rules differ.",
  "A cursor is not a source of truth.",
  "Diagnostics are not a source of truth.",
  "Indexes are derived state, not source truth.",
  "Repair plans must converge devices toward packet-ledger truth.",
  "Phones are real bounded peers and may hold local derived state.",
  "Laptops/desktops are preferred for heavier convergence review, replay, diagnostics, and repair planning.",
  "Repeated unchanged derived state must not be transmitted.",
  "Critical deterministic convergence checks should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_DETERMINISTIC_STATE_CONVERGENCE_BOUNDARY: readonly MyceliumDeterministicStateConvergenceRule[] =
  [
    {
      area: "packet_acceptance",
      purpose:
        "Ensures devices agree on whether a packet is valid enough to enter Mycelium ledger-derived state.",
      convergenceRisk: "must_explain_before_repair",
      requiredInputs: [
        "packet content",
        "packet validation policy",
        "expiry policy",
        "future hash/signature policy",
      ],
      mismatchCauses: [
        "one device accepted a packet another rejected",
        "validation policy version mismatch",
        "expired packet handled differently",
        "corrupted packet accepted by one device",
      ],
      phoneRole: [
        "perform bounded local validation",
        "reject locally unsafe packets",
        "defer large validation review",
      ],
      laptopDesktopRole: [
        "review larger validation mismatches",
        "audit packet windows",
        "prepare compact validation summaries",
      ],
      mustNeverDo: [
        "derive state from invalid packets",
        "silently rewrite packets",
        "treat diagnostics as packet truth",
      ],
      ledgerRule:
        "Only valid packets may contribute to accepted packet-ledger state.",
      policyCompatibilityRule:
        "Devices must expose validation policy mismatch before assuming convergence.",
      deltaOnlyRule:
        "Validation repair should move packet deltas or compact summaries, not repeated full state.",
      futureNativeBoundary:
        "Packet acceptance convergence should eventually be enforced behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "phrase_state",
      purpose:
        "Ensures phrase lookup and phrase index state remain derived from valid phrase-related packets.",
      convergenceRisk: "high",
      requiredInputs: [
        "phrase observation packets",
        "phrase index policy",
        "packet order policy",
        "compatible derivation policy",
      ],
      mismatchCauses: [
        "missing phrase packet",
        "different phrase index version",
        "different packet window",
        "index rebuild drift",
      ],
      phoneRole: [
        "hold bounded local phrase state",
        "accept phrase deltas",
        "defer full phrase index rebuilds",
      ],
      laptopDesktopRole: [
        "rebuild phrase indexes",
        "compare phrase-derived state",
        "prepare bounded phrase repair summaries",
      ],
      mustNeverDo: [
        "treat phrase index as source truth",
        "broadcast unchanged phrase state repeatedly",
        "invent phrase state outside packets",
      ],
      ledgerRule:
        "Phrase state must be reproducible from valid phrase-related packets.",
      policyCompatibilityRule:
        "Phrase convergence requires compatible phrase derivation and indexing rules.",
      deltaOnlyRule:
        "Phrase convergence should use packet deltas and compact summaries.",
      futureNativeBoundary:
        "Phrase convergence checks should eventually move behind native indexing boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "meaning_state",
      purpose:
        "Ensures meaning candidates, votes, scores, and best-meaning state remain deterministic.",
      convergenceRisk: "must_explain_before_repair",
      requiredInputs: [
        "meaning proposal packets",
        "meaning vote packets",
        "correction packets",
        "tombstone packets",
        "meaning scoring policy",
      ],
      mismatchCauses: [
        "missing meaning packet",
        "different scoring policy",
        "correction state mismatch",
        "tombstone state mismatch",
      ],
      phoneRole: [
        "hold bounded local meaning state",
        "accept meaning and correction deltas",
        "defer heavy scoring review",
      ],
      laptopDesktopRole: [
        "review larger meaning windows",
        "audit scoring mismatches",
        "prepare compact meaning convergence summaries",
      ],
      mustNeverDo: [
        "treat local meaning index as final authority",
        "finalize meaning outside valid packet evidence",
        "repeatedly transmit unchanged meaning state",
      ],
      ledgerRule:
        "Meaning state must derive from valid meaning, vote, correction, and tombstone packets.",
      policyCompatibilityRule:
        "Meaning convergence requires compatible scoring and correction policies.",
      deltaOnlyRule:
        "Meaning convergence should move missing packets, correction deltas, and compact scoring summaries.",
      futureNativeBoundary:
        "Meaning scoring and convergence should eventually move behind Rust/WASM/native deterministic derivation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "correction_state",
      purpose:
        "Ensures correction state remains packet-backed and does not treat weak authority as final truth.",
      convergenceRisk: "must_explain_before_repair",
      requiredInputs: [
        "correction proposal packets",
        "correction vote packets",
        "correction reject packets",
        "correction tombstone packets",
        "correction threshold policy",
      ],
      mismatchCauses: [
        "one device missed correction votes",
        "weak correction treated as confirmed",
        "contested correction hidden",
        "threshold policy mismatch",
      ],
      phoneRole: [
        "show bounded correction status",
        "accept correction deltas",
        "keep weak correction state provisional",
        "defer contested review",
      ],
      laptopDesktopRole: [
        "audit correction vote windows",
        "review contested corrections",
        "prepare compact threshold summaries",
      ],
      mustNeverDo: [
        "treat one confirm as final truth by default",
        "use absence of rejects as enough authority by itself",
        "hide contested correction state",
      ],
      ledgerRule:
        "Correction state must derive from valid correction-related ledger packets.",
      policyCompatibilityRule:
        "Correction convergence requires compatible threshold and contest policies.",
      deltaOnlyRule:
        "Correction convergence should move correction deltas and compact status summaries.",
      futureNativeBoundary:
        "Correction convergence and threshold checks should eventually move behind native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "tombstone_state",
      purpose:
        "Ensures deleted, expired, or inactive state is not silently resurrected across devices.",
      convergenceRisk: "must_explain_before_repair",
      requiredInputs: [
        "tombstone packets",
        "expiry policy",
        "cleanup policy",
        "active/inactive derivation policy",
      ],
      mismatchCauses: [
        "one device missed a tombstone",
        "incomplete import restored old state",
        "cleanup policy mismatch",
        "expired packet handled differently",
      ],
      phoneRole: [
        "accept bounded tombstone deltas",
        "avoid resurrecting tombstoned state",
        "defer large tombstone audits",
      ],
      laptopDesktopRole: [
        "audit tombstone windows",
        "review cleanup candidates",
        "prepare bounded tombstone repair summaries",
      ],
      mustNeverDo: [
        "silently erase ledger truth",
        "resurrect tombstoned state without packet evidence",
        "treat deletion as non-ledger authority",
      ],
      ledgerRule:
        "Tombstone state must preserve tombstone packets as part of ledger truth.",
      policyCompatibilityRule:
        "Tombstone convergence requires compatible lifecycle and cleanup rules.",
      deltaOnlyRule:
        "Tombstone convergence should move tombstone deltas and compact audit summaries.",
      futureNativeBoundary:
        "Tombstone convergence should eventually move behind native lifecycle and integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "identity_state",
      purpose:
        "Ensures identity/device state can converge without requiring cloud identity ownership.",
      convergenceRisk: "high",
      requiredInputs: [
        "identity-related packets where applicable",
        "device identity policy",
        "local identity state policy",
        "portability policy",
      ],
      mismatchCauses: [
        "offline identity change",
        "missing identity packet",
        "identity policy mismatch",
        "portable identity window incomplete",
      ],
      phoneRole: [
        "hold bounded local identity state",
        "request bounded identity deltas",
        "surface local identity warnings",
      ],
      laptopDesktopRole: [
        "review identity consistency",
        "diagnose identity mismatch",
        "prepare compact identity summaries",
      ],
      mustNeverDo: [
        "require cloud identity ownership",
        "silently override packet-backed identity state",
        "broadcast unchanged identity state repeatedly",
      ],
      ledgerRule:
        "Identity state must remain tied to packet-backed identity/device events where represented in Mycelium.",
      policyCompatibilityRule:
        "Identity convergence requires compatible identity policy rules.",
      deltaOnlyRule:
        "Identity convergence should move changed identity events or compact mismatch summaries.",
      futureNativeBoundary:
        "Identity convergence should eventually move behind native identity-safety boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "settings_state",
      purpose:
        "Ensures settings state can converge without repeatedly broadcasting unchanged settings.",
      convergenceRisk: "moderate",
      requiredInputs: [
        "settings change packets where applicable",
        "settings conflict policy",
        "device-local settings policy",
      ],
      mismatchCauses: [
        "one device missed a settings change",
        "offline settings update",
        "settings conflict policy mismatch",
      ],
      phoneRole: [
        "hold local settings for offline use",
        "accept bounded settings deltas",
        "surface settings conflict warnings",
      ],
      laptopDesktopRole: [
        "review multi-device settings conflicts",
        "prepare compact settings summaries",
        "support portability review",
      ],
      mustNeverDo: [
        "broadcast unchanged settings repeatedly",
        "silently let device preference override packet-backed changes",
        "require cloud settings ownership",
      ],
      ledgerRule:
        "Where settings are represented as packets, settings state must resolve through valid settings events and policy.",
      policyCompatibilityRule:
        "Settings convergence requires compatible settings conflict policy.",
      deltaOnlyRule:
        "Settings convergence should move settings deltas and compact conflict summaries.",
      futureNativeBoundary:
        "Settings convergence should eventually move behind native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "diagnostics_state",
      purpose:
        "Ensures diagnostics explain convergence problems without becoming the source of truth.",
      convergenceRisk: "moderate",
      requiredInputs: [
        "packet window summaries",
        "cursor summaries",
        "derived-state summaries",
        "diagnostics policy",
      ],
      mismatchCauses: [
        "phone reported bounded diagnostics only",
        "laptop/desktop ran deeper diagnostics",
        "diagnostics policy mismatch",
        "different packet windows were inspected",
      ],
      phoneRole: [
        "show lightweight diagnostics",
        "report bounded local sync health",
        "defer full diagnostics scans",
      ],
      laptopDesktopRole: [
        "run deeper diagnostics",
        "compare larger packet windows",
        "prepare compact repair guidance",
      ],
      mustNeverDo: [
        "treat diagnostics as source truth",
        "force heavy diagnostics on phones by default",
        "broadcast unchanged diagnostics repeatedly",
      ],
      ledgerRule:
        "Diagnostics may explain ledger-derived state but must not override the packet ledger.",
      policyCompatibilityRule:
        "Diagnostics convergence requires compatible diagnostics summary policy.",
      deltaOnlyRule:
        "Diagnostics convergence should move compact summaries and repair hints.",
      futureNativeBoundary:
        "Diagnostics convergence checks should eventually move behind native audit boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "ledger_portability_state",
      purpose:
        "Ensures portable Mycelium packet windows can replay into the same derived state under compatible rules.",
      convergenceRisk: "must_explain_before_repair",
      requiredInputs: [
        "portable packet windows",
        "import/export integrity policy",
        "packet validation policy",
        "derived-state policy",
      ],
      mismatchCauses: [
        "portable packet window incomplete",
        "import validation mismatch",
        "policy mismatch during replay",
        "corrupted export/import summary",
      ],
      phoneRole: [
        "show bounded portability warnings",
        "verify small local imports where policy allows",
        "defer full integrity review",
      ],
      laptopDesktopRole: [
        "review larger portable packet windows",
        "perform bulk integrity checks",
        "prepare bounded phone-safe portability summaries",
      ],
      mustNeverDo: [
        "trust imported packet windows without validation",
        "mix in non-Mycelium layer behavior",
        "force large phone export/import by default",
      ],
      ledgerRule:
        "Ledger portability must preserve packet-ledger truth and deterministic replay safety.",
      policyCompatibilityRule:
        "Portability convergence requires compatible validation, import/export, and derived-state rules.",
      deltaOnlyRule:
        "Portability convergence should move verifiable packet windows and compact integrity summaries.",
      futureNativeBoundary:
        "Ledger portability convergence should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
