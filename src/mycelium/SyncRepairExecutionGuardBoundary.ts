/**
 * DAOVibe / Mycelium sync repair execution guard boundary.
 *
 * Architecture-only.
 *
 * Commit 48 classified sync conflicts.
 * Commit 49 defined repair planning.
 * This boundary defines guardrails that must exist before any future repair
 * execution is allowed.
 *
 * This file does not execute repair.
 * This file does not mutate packets.
 * This file does not write storage.
 * This file does not run sync, networking, peer discovery, scheduling,
 * mobile behavior, desktop packaging, cloud sync, or native enforcement.
 *
 * The packet ledger remains the source of truth.
 */

export type MyceliumSyncRepairExecutionGuardRuntimeStatus = "architecture_only";

export type MyceliumSyncRepairExecutionGuardName =
  | "packet_ledger_evidence_required"
  | "classified_conflict_required"
  | "repair_plan_required"
  | "phone_budget_guard"
  | "laptop_desktop_deferral_guard"
  | "delta_only_output_guard"
  | "tombstone_safety_guard"
  | "correction_threshold_guard"
  | "deterministic_replay_guard"
  | "portability_integrity_guard";

export type MyceliumSyncRepairExecutionGuardDecision =
  | "allow_future_execution_only_when_satisfied"
  | "defer_to_laptop_desktop"
  | "block_until_reviewed";

export interface MyceliumSyncRepairExecutionGuardBoundary {
  readonly name: MyceliumSyncRepairExecutionGuardName;
  readonly purpose: string;
  readonly protectsAgainst: readonly string[];
  readonly mustVerifyBeforeFutureExecution: readonly string[];
  readonly phoneConstraint: readonly string[];
  readonly laptopDesktopResponsibility: readonly string[];
  readonly decision: MyceliumSyncRepairExecutionGuardDecision;
  readonly mustNeverAllow: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSyncRepairExecutionGuardRuntimeStatus;
}

export const MYCELIUM_SYNC_REPAIR_EXECUTION_GUARD_CORE_RULES = [
  "Repair execution guards are architecture-only in this commit.",
  "No repair is executed by this boundary.",
  "The packet ledger remains the source of truth.",
  "A repair must be based on a classified conflict.",
  "A repair must be based on an explicit repair plan.",
  "Phones may only participate in bounded future repair execution.",
  "Laptops/desktops are preferred for heavy repair review and execution planning.",
  "Future repair output should be packet deltas, tombstone deltas, correction deltas, cursor repair windows, compact summaries, or phone-safe repair guidance.",
  "Future repair must not transmit repeated unchanged full state.",
  "Future repair must not invent packets, silently erase ledger truth, or create cloud authority.",
  "Same valid packets must derive the same state on every device.",
  "Critical repair execution checks should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_SYNC_REPAIR_EXECUTION_GUARD_BOUNDARY: readonly MyceliumSyncRepairExecutionGuardBoundary[] =
  [
    {
      name: "packet_ledger_evidence_required",
      purpose:
        "Requires future repair execution to be backed by valid packet-ledger evidence instead of local preference or derived-state guesswork.",
      protectsAgainst: [
        "invented packets",
        "manual state override",
        "cloud-owned repair truth",
        "derived state pretending to be source truth",
      ],
      mustVerifyBeforeFutureExecution: [
        "the repair references valid packet-ledger evidence",
        "the repair does not depend only on derived state",
        "the repair can be traced to packet IDs, packet windows, tombstones, corrections, or cursor evidence",
      ],
      phoneConstraint: [
        "phone may verify bounded local evidence",
        "phone should defer large evidence review",
      ],
      laptopDesktopResponsibility: [
        "review larger packet windows",
        "validate evidence chains",
        "prepare compact phone-safe evidence summaries",
      ],
      decision: "allow_future_execution_only_when_satisfied",
      mustNeverAllow: [
        "repair without ledger evidence",
        "repair based only on UI state",
        "repair based on cloud authority",
      ],
      ledgerRule:
        "Future repair execution must preserve packet-ledger truth.",
      deltaOnlyRule:
        "Repair evidence should move as packet references, bounded windows, or compact summaries, not repeated full state.",
      deterministicStateRule:
        "Repair based on the same valid evidence must produce the same derived-state result under the same rules.",
      futureNativeBoundary:
        "Packet-ledger evidence validation should eventually move behind Rust/WASM/native repair guard boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "classified_conflict_required",
      purpose:
        "Requires future repair execution to begin from a known conflict classification instead of blindly modifying state.",
      protectsAgainst: [
        "blind repair",
        "wrong repair type",
        "silent state mutation",
        "unexplained convergence behavior",
      ],
      mustVerifyBeforeFutureExecution: [
        "the conflict has a recognized classification",
        "the classification is tied to packet, cursor, tombstone, correction, identity, settings, diagnostics, or portability evidence",
        "the repair path matches the conflict type",
      ],
      phoneConstraint: [
        "phone may classify bounded local conflicts",
        "phone should defer heavy classification review",
      ],
      laptopDesktopResponsibility: [
        "review large-window classifications",
        "explain conflict categories",
        "prepare repair-safe classification summaries",
      ],
      decision: "allow_future_execution_only_when_satisfied",
      mustNeverAllow: [
        "repair without classification",
        "repair by guessing",
        "repair that hides the conflict type",
      ],
      ledgerRule:
        "Conflict classification must explain disagreement against packet-ledger state.",
      deltaOnlyRule:
        "Classification should produce compact summaries and deltas, not repeated full-state sync.",
      deterministicStateRule:
        "The same conflict evidence and policy should classify the conflict the same way.",
      futureNativeBoundary:
        "Conflict classification validation should eventually move behind native repair guard boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "repair_plan_required",
      purpose:
        "Requires future repair execution to use an explicit repair plan before any state-changing behavior exists.",
      protectsAgainst: [
        "unplanned mutation",
        "runtime shortcut repair",
        "device-specific repair preference",
        "hidden repair behavior",
      ],
      mustVerifyBeforeFutureExecution: [
        "a repair plan exists",
        "the repair plan matches the classified conflict",
        "the repair plan defines allowed output and forbidden output",
        "the repair plan respects phone/laptop-desktop responsibilities",
      ],
      phoneConstraint: [
        "phone may follow bounded phone-safe repair guidance",
        "phone should not execute heavy plans by default",
      ],
      laptopDesktopResponsibility: [
        "prepare heavier repair plans",
        "review larger evidence windows",
        "produce bounded phone-safe repair guidance",
      ],
      decision: "allow_future_execution_only_when_satisfied",
      mustNeverAllow: [
        "repair without a plan",
        "repair plan that creates non-ledger truth",
        "repair plan that requires repeated unchanged full-state sync",
      ],
      ledgerRule:
        "Repair plans must converge toward valid packet-ledger state.",
      deltaOnlyRule:
        "Repair plans should produce deltas, cursor windows, compact summaries, or phone-safe guidance.",
      deterministicStateRule:
        "The same valid repair plan applied to the same packet evidence should converge deterministically.",
      futureNativeBoundary:
        "Repair-plan validation should eventually move behind Rust/WASM/native repair execution boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "phone_budget_guard",
      purpose:
        "Prevents future repair execution from forcing phones into heavy work that violates bounded phone sync budgets.",
      protectsAgainst: [
        "battery-heavy phone repair",
        "large phone ledger scans",
        "heavy phone diagnostics",
        "mobile background execution assumptions",
      ],
      mustVerifyBeforeFutureExecution: [
        "phone work is bounded",
        "phone work avoids full ledger replay by default",
        "phone work does not require sustained background execution",
        "phone work can defer to laptop/desktop when heavy",
      ],
      phoneConstraint: [
        "phone may apply small deltas",
        "phone may show local warnings",
        "phone may request bounded repair windows",
        "phone should defer heavy repair review",
      ],
      laptopDesktopResponsibility: [
        "absorb heavy repair review",
        "prepare phone-safe deltas",
        "run deeper diagnostics and reconciliation",
      ],
      decision: "defer_to_laptop_desktop",
      mustNeverAllow: [
        "unbounded phone repair",
        "always-on mobile repair loops",
        "full phone ledger replay by default",
      ],
      ledgerRule:
        "Phone budget limits may defer work but must not change packet-ledger truth.",
      deltaOnlyRule:
        "Phone repair should use bounded deltas and compact summaries.",
      deterministicStateRule:
        "Phones should converge to the same derived state after receiving valid bounded repair deltas.",
      futureNativeBoundary:
        "Phone repair budget enforcement should eventually move behind mobile-safe native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "laptop_desktop_deferral_guard",
      purpose:
        "Requires heavy repair execution to defer to laptop/desktop peers without making them central authorities.",
      protectsAgainst: [
        "phone overload",
        "desktop-as-central-server design",
        "cloud repair authority",
        "single-device truth ownership",
      ],
      mustVerifyBeforeFutureExecution: [
        "heavy work is assigned to laptop/desktop where possible",
        "laptop/desktop output remains tied to packet-ledger evidence",
        "phones remain real bounded peers",
        "laptop/desktop does not become final truth owner",
      ],
      phoneConstraint: [
        "phone may consume bounded repair output",
        "phone may preserve offline state",
        "phone should not be treated as thin client",
      ],
      laptopDesktopResponsibility: [
        "perform heavier review",
        "prepare compact deltas",
        "explain reconciliation evidence",
        "avoid becoming central authority",
      ],
      decision: "defer_to_laptop_desktop",
      mustNeverAllow: [
        "desktop-only ownership",
        "laptop as source of truth",
        "central-server repair model",
      ],
      ledgerRule:
        "Laptops/desktops help repair planning and review, but packet ledger remains source of truth.",
      deltaOnlyRule:
        "Laptop/desktop repair output should be bounded and delta-oriented.",
      deterministicStateRule:
        "Repair output should help every device converge to the same packet-derived state.",
      futureNativeBoundary:
        "Heavy repair deferral and evidence validation should eventually move behind native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "delta_only_output_guard",
      purpose:
        "Prevents future repair execution from using repeated unchanged full-state transmission as a repair strategy.",
      protectsAgainst: [
        "full-state broadcast loops",
        "network-heavy repair",
        "battery-heavy repair",
        "derived-state sync replacing packet sync",
      ],
      mustVerifyBeforeFutureExecution: [
        "repair output is a delta, packet window, cursor hint, tombstone delta, correction delta, compact summary, or phone-safe guidance",
        "unchanged phrase, meaning, correction, identity, settings, or diagnostics state is not repeatedly transmitted",
      ],
      phoneConstraint: [
        "phone should receive compact repair outputs",
        "phone should not receive repeated unchanged full state",
      ],
      laptopDesktopResponsibility: [
        "compress heavy review into bounded deltas",
        "prepare compact repair guidance",
        "avoid full-state repair output by default",
      ],
      decision: "allow_future_execution_only_when_satisfied",
      mustNeverAllow: [
        "repeated unchanged full-state sync",
        "derived state replacing packet-ledger deltas",
        "unbounded repair broadcasts",
      ],
      ledgerRule:
        "Repair output must remain traceable to packet-ledger evidence.",
      deltaOnlyRule:
        "Future repair execution should move only the minimum needed deltas or compact summaries.",
      deterministicStateRule:
        "Applying valid repair deltas should move devices toward the same derived state.",
      futureNativeBoundary:
        "Delta-only repair output checks should eventually move behind Rust/WASM/native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "tombstone_safety_guard",
      purpose:
        "Protects future repair execution from resurrecting tombstoned state or silently erasing ledger truth.",
      protectsAgainst: [
        "state resurrection",
        "silent deletion",
        "hidden ledger rewrite",
        "cleanup without tombstone evidence",
      ],
      mustVerifyBeforeFutureExecution: [
        "tombstone evidence is present where required",
        "repair does not erase the existence of tombstone packets",
        "repair does not reactivate inactive state without valid packet evidence",
      ],
      phoneConstraint: [
        "phone may accept bounded tombstone deltas",
        "phone should avoid full tombstone audits",
      ],
      laptopDesktopResponsibility: [
        "audit larger tombstone windows",
        "review cleanup candidates",
        "prepare bounded tombstone repair summaries",
      ],
      decision: "block_until_reviewed",
      mustNeverAllow: [
        "silent ledger erasure",
        "resurrection of tombstoned state without review",
        "non-ledger deletion authority",
      ],
      ledgerRule:
        "Tombstone repair must preserve packet-ledger truth and tombstone evidence.",
      deltaOnlyRule:
        "Tombstone repair should move tombstone deltas and compact audit summaries.",
      deterministicStateRule:
        "The same valid packet and tombstone set must derive the same active/inactive state.",
      futureNativeBoundary:
        "Tombstone repair safety should eventually move behind native lifecycle/integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "correction_threshold_guard",
      purpose:
        "Prevents future repair execution from finalizing weak or contested correction state without enough packet-backed authority.",
      protectsAgainst: [
        "single-vote final authority",
        "absence-of-rejects treated as enough proof",
        "contested state hidden as confirmed state",
        "manual correction authority",
      ],
      mustVerifyBeforeFutureExecution: [
        "correction evidence is packet-backed",
        "threshold policy is satisfied before final status",
        "contested state remains visible when unresolved",
        "weak correction state may remain provisional",
      ],
      phoneConstraint: [
        "phone may display provisional or contested status",
        "phone may accept correction deltas",
        "phone should defer heavy contest review",
      ],
      laptopDesktopResponsibility: [
        "review correction vote windows",
        "audit contested correction status",
        "prepare compact threshold summaries",
      ],
      decision: "block_until_reviewed",
      mustNeverAllow: [
        "weak correction finalized as truth",
        "single confirm treated as enough authority by default",
        "hidden correction contest",
      ],
      ledgerRule:
        "Correction authority must come from valid correction-related ledger packets and policy thresholds.",
      deltaOnlyRule:
        "Correction repair should move correction deltas and compact status summaries.",
      deterministicStateRule:
        "All devices with the same correction packets and policy must classify correction status the same way.",
      futureNativeBoundary:
        "Correction threshold validation should eventually move behind native validation/reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "deterministic_replay_guard",
      purpose:
        "Requires future repair execution to preserve same-valid-packets to same-derived-state determinism.",
      protectsAgainst: [
        "device-specific derived state",
        "unstable replay order",
        "manual state patches",
        "policy mismatch hidden as repair",
      ],
      mustVerifyBeforeFutureExecution: [
        "repair result is reproducible from valid packets",
        "replay order is stable where order matters",
        "policy version differences are visible",
        "derived state is not patched outside packet evidence",
      ],
      phoneConstraint: [
        "phone may apply bounded deterministic repair deltas",
        "phone should defer full replay checks",
      ],
      laptopDesktopResponsibility: [
        "run larger deterministic replay checks",
        "compare derived-state summaries",
        "prepare repair guidance that preserves deterministic state",
      ],
      decision: "allow_future_execution_only_when_satisfied",
      mustNeverAllow: [
        "manual derived-state patching",
        "unstable replay behavior",
        "device preference as truth",
      ],
      ledgerRule:
        "Deterministic replay must be grounded in packet-ledger truth.",
      deltaOnlyRule:
        "Replay repair should move missing packets, ordering hints, cursor windows, or compact summaries.",
      deterministicStateRule:
        "Same valid packets and same policy must derive the same state on every device.",
      futureNativeBoundary:
        "Deterministic replay validation should eventually move behind Rust/WASM/native replay boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "portability_integrity_guard",
      purpose:
        "Protects future ledger export/import repair from accepting portable packet windows without integrity review.",
      protectsAgainst: [
        "trusted import without validation",
        "corrupted portable packet windows",
        "non-Mycelium behavior entering Mycelium repair",
        "large phone export/import work by default",
      ],
      mustVerifyBeforeFutureExecution: [
        "portable packet windows are validated",
        "export/import review preserves packet-ledger truth",
        "phone work remains bounded",
        "non-Mycelium layer behavior is excluded",
      ],
      phoneConstraint: [
        "phone may show bounded portability warning",
        "phone may verify small local imports where policy allows",
        "phone should defer full integrity review",
      ],
      laptopDesktopResponsibility: [
        "perform bulk portability review",
        "validate larger packet windows",
        "prepare bounded phone-safe portability summaries",
      ],
      decision: "block_until_reviewed",
      mustNeverAllow: [
        "blind trust in imported packet windows",
        "currency behavior",
        "payment behavior",
        "marketplace behavior",
        "non-Mycelium layer state",
      ],
      ledgerRule:
        "Ledger portability repair must preserve packet-ledger truth and deterministic replay safety.",
      deltaOnlyRule:
        "Portability repair should move verifiable packet windows and compact integrity summaries.",
      deterministicStateRule:
        "Accepted portable packets must replay into the same derived Mycelium state under the same rules.",
      futureNativeBoundary:
        "Ledger portability integrity should eventually move behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
