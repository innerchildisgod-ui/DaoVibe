/**
 * DAOVibe / Mycelium policy version compatibility boundary.
 *
 * Architecture-only.
 *
 * Mycelium depends on deterministic derived state:
 * same valid packets + same policy rules -> same derived state.
 *
 * This boundary defines how future Mycelium sync should think about policy
 * version compatibility before any runtime negotiation, peer discovery,
 * networking, storage writes, mobile behavior, desktop packaging, cloud sync,
 * or native enforcement exists.
 *
 * The packet ledger remains the source of truth.
 */

export type MyceliumPolicyVersionRuntimeStatus = "architecture_only";

export type MyceliumPolicyVersionArea =
  | "packet_validation"
  | "synchronizer_architecture"
  | "device_capability"
  | "synchronizer_workload_policy"
  | "bounded_phone_budget"
  | "laptop_desktop_reconciliation"
  | "cursor_window_contract"
  | "conflict_classification"
  | "repair_planning"
  | "repair_execution_guard"
  | "derived_state_rules"
  | "future_native_boundary";

export type MyceliumPolicyCompatibilityRisk =
  | "low"
  | "moderate"
  | "high"
  | "must_not_silently_merge";

export interface MyceliumPolicyVersionCompatibilityRule {
  readonly area: MyceliumPolicyVersionArea;
  readonly purpose: string;
  readonly compatibilityRisk: MyceliumPolicyCompatibilityRisk;
  readonly mustTrack: readonly string[];
  readonly phoneConstraint: readonly string[];
  readonly laptopDesktopResponsibility: readonly string[];
  readonly mismatchMustExplain: readonly string[];
  readonly mustNeverDo: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumPolicyVersionRuntimeStatus;
}

export const MYCELIUM_POLICY_VERSION_COMPATIBILITY_CORE_RULES = [
  "Policy version compatibility is architecture-only in this commit.",
  "The packet ledger remains the source of truth.",
  "Same valid packets should derive the same state only when the relevant policy rules are compatible.",
  "Policy mismatch must be visible, not silently hidden.",
  "Phones may track bounded policy metadata needed for local/offline safety.",
  "Laptops/desktops are preferred for deeper policy mismatch diagnostics and compatibility review.",
  "Policy version checks must not require cloud ownership or central server ownership.",
  "Policy metadata should move as compact deltas or summaries, not repeated unchanged state.",
  "Future native/Rust/WASM boundaries should enforce critical compatibility checks.",
] as const;

export const MYCELIUM_POLICY_VERSION_COMPATIBILITY_BOUNDARY: readonly MyceliumPolicyVersionCompatibilityRule[] =
  [
    {
      area: "packet_validation",
      purpose:
        "Tracks packet validation policy compatibility so devices do not accept or reject the same packet differently without explanation.",
      compatibilityRisk: "high",
      mustTrack: [
        "packet shape/version expectations",
        "required field policy",
        "expiry policy",
        "future hash/signature validation policy",
      ],
      phoneConstraint: [
        "phone may track bounded validation policy metadata",
        "phone should reject locally unsafe packets",
        "phone should defer large validation mismatch review",
      ],
      laptopDesktopResponsibility: [
        "review larger validation mismatches",
        "diagnose packet policy drift",
        "prepare compact compatibility summaries",
      ],
      mismatchMustExplain: [
        "why one device accepted a packet",
        "why another device rejected the same packet",
        "which validation rule differed",
      ],
      mustNeverDo: [
        "silently accept invalid packets",
        "silently rewrite packets to match local policy",
        "hide validation policy mismatch",
      ],
      ledgerRule:
        "Validation policy must protect packet-ledger truth and must not invent ledger entries.",
      deltaOnlyRule:
        "Validation policy metadata should move as compact policy/version summaries.",
      deterministicStateRule:
        "Devices using the same validation policy should classify the same packet consistently.",
      futureNativeBoundary:
        "Packet validation compatibility should eventually move behind Rust/WASM/native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "synchronizer_architecture",
      purpose:
        "Tracks compatibility for the defined Mycelium synchronizer set: packet, phrase, meaning, correction, tombstone, identity, settings, diagnostics, and ledger portability.",
      compatibilityRisk: "moderate",
      mustTrack: [
        "known synchronizer names",
        "architecture-only synchronizer status",
        "source-of-truth expectations",
        "future native boundary expectations",
      ],
      phoneConstraint: [
        "phone may know the synchronizers needed for bounded local sync",
        "phone should not run unknown heavy synchronizer behavior",
      ],
      laptopDesktopResponsibility: [
        "review synchronizer compatibility gaps",
        "prepare summaries for unsupported synchronizer areas",
      ],
      mismatchMustExplain: [
        "which synchronizer is missing or unsupported",
        "whether the mismatch affects derived state",
      ],
      mustNeverDo: [
        "silently map unknown synchronizers to unrelated behavior",
        "replace packet-ledger sync with cloud sync",
      ],
      ledgerRule:
        "Synchronizer compatibility must preserve packet-ledger source-of-truth behavior.",
      deltaOnlyRule:
        "Synchronizer compatibility should move compact capability summaries, not repeated unchanged state.",
      deterministicStateRule:
        "Devices must not assume deterministic convergence when they do not share required synchronizer policy.",
      futureNativeBoundary:
        "Synchronizer compatibility checks should eventually be validated by native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "device_capability",
      purpose:
        "Tracks whether devices agree on phone and laptop/desktop capability policy before assigning heavy work.",
      compatibilityRisk: "moderate",
      mustTrack: [
        "phone bounded-peer role",
        "laptop/desktop heavy-peer role",
        "allowed phone work",
        "preferred laptop/desktop work",
      ],
      phoneConstraint: [
        "phone may expose bounded capability metadata",
        "phone should not be treated as unlimited",
      ],
      laptopDesktopResponsibility: [
        "review capability mismatch",
        "avoid treating itself as central authority",
        "prepare phone-safe work summaries",
      ],
      mismatchMustExplain: [
        "whether a phone is being overloaded",
        "whether laptop/desktop deferral is expected",
        "whether device role policy differs",
      ],
      mustNeverDo: [
        "make phones thin clients",
        "force phones into heavy default work",
        "make laptops/desktops central servers",
      ],
      ledgerRule:
        "Device capability policy may affect workload placement but must not alter packet-ledger truth.",
      deltaOnlyRule:
        "Capability updates should move as compact metadata, not repeated unchanged state.",
      deterministicStateRule:
        "Capability mismatch must not create hidden derived-state divergence.",
      futureNativeBoundary:
        "Device capability enforcement should eventually move behind platform/native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "synchronizer_workload_policy",
      purpose:
        "Tracks compatibility between synchronizer workload rules and device responsibilities.",
      compatibilityRisk: "moderate",
      mustTrack: [
        "phone allowed work",
        "phone avoided work",
        "laptop/desktop preferred work",
        "must-never-do rules",
      ],
      phoneConstraint: [
        "phone may use bounded workload policy summaries",
        "phone should defer heavy workload mismatch review",
      ],
      laptopDesktopResponsibility: [
        "review workload policy drift",
        "prepare compact compatibility guidance",
      ],
      mismatchMustExplain: [
        "which synchronizer workload rule differs",
        "whether phone or laptop/desktop responsibility changed",
      ],
      mustNeverDo: [
        "silently assign forbidden work",
        "force full-state sync as workload repair",
      ],
      ledgerRule:
        "Workload policy must support packet-ledger convergence, not replace it.",
      deltaOnlyRule:
        "Workload compatibility should be summarized compactly.",
      deterministicStateRule:
        "Workload policy mismatch must not silently produce different derived state.",
      futureNativeBoundary:
        "Workload policy enforcement should eventually move behind native scheduling/sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "bounded_phone_budget",
      purpose:
        "Tracks compatibility for phone battery, storage, network, CPU, thermal, background execution, diagnostics, reconciliation, and export/import limits.",
      compatibilityRisk: "high",
      mustTrack: [
        "phone budget category policy",
        "defer-to-laptop/desktop triggers",
        "phone-safe delta expectations",
      ],
      phoneConstraint: [
        "phone may enforce local bounded behavior",
        "phone should defer heavy policy mismatch review",
      ],
      laptopDesktopResponsibility: [
        "review phone budget mismatch",
        "prepare smaller phone-safe deltas",
      ],
      mismatchMustExplain: [
        "whether a phone is being asked to exceed budget",
        "which budget category is affected",
      ],
      mustNeverDo: [
        "force always-on phone sync",
        "force full phone ledger scans by default",
        "hide phone budget violations",
      ],
      ledgerRule:
        "Phone budget mismatch may defer work but must not change ledger truth.",
      deltaOnlyRule:
        "Phone-safe sync should remain delta-oriented.",
      deterministicStateRule:
        "Phone budget differences must not create hidden state divergence.",
      futureNativeBoundary:
        "Phone budget compatibility should eventually move behind mobile/native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "laptop_desktop_reconciliation",
      purpose:
        "Tracks compatibility for heavier laptop/desktop reconciliation responsibilities without turning them into central authority.",
      compatibilityRisk: "moderate",
      mustTrack: [
        "packet-window review expectations",
        "bulk validation expectations",
        "diagnostics expectations",
        "phone-safe delta preparation expectations",
      ],
      phoneConstraint: [
        "phone may consume bounded reconciliation output",
        "phone should not depend on laptop/desktop as final authority",
      ],
      laptopDesktopResponsibility: [
        "review larger mismatches",
        "produce compact reconciliation summaries",
        "avoid central-server behavior",
      ],
      mismatchMustExplain: [
        "which reconciliation responsibility differs",
        "whether output is packet-backed",
      ],
      mustNeverDo: [
        "make laptop/desktop source of truth",
        "override packet-ledger evidence",
        "require cloud reconciliation",
      ],
      ledgerRule:
        "Laptop/desktop reconciliation must remain grounded in packet-ledger truth.",
      deltaOnlyRule:
        "Reconciliation compatibility should produce compact summaries and deltas.",
      deterministicStateRule:
        "Reconciliation policy must support same-packets same-state convergence.",
      futureNativeBoundary:
        "Reconciliation compatibility should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "cursor_window_contract",
      purpose:
        "Tracks cursor and packet-window contract compatibility so sync resume behavior does not diverge silently.",
      compatibilityRisk: "high",
      mustTrack: [
        "cursor meaning",
        "packet window kind",
        "missing packet window policy",
        "tombstone and correction window policy",
        "ledger portability window policy",
      ],
      phoneConstraint: [
        "phone may use bounded cursor/window metadata",
        "phone should request safe repair windows when mismatch appears",
      ],
      laptopDesktopResponsibility: [
        "audit cursor/window mismatch",
        "prepare bounded repair windows",
        "review packet gaps",
      ],
      mismatchMustExplain: [
        "which cursor/window rule differs",
        "whether packets are missing",
        "whether a cursor gap exists",
      ],
      mustNeverDo: [
        "treat cursor as source truth",
        "silently skip packet validation",
        "repair by repeated full-state sync",
      ],
      ledgerRule:
        "Cursor/window compatibility must resolve against packet-ledger data.",
      deltaOnlyRule:
        "Cursor/window mismatch should move bounded packet windows and compact summaries.",
      deterministicStateRule:
        "Same packet windows under the same policy should produce the same derived state.",
      futureNativeBoundary:
        "Cursor/window compatibility should eventually move behind native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "conflict_classification",
      purpose:
        "Tracks compatibility for sync conflict classification so devices describe the same mismatch consistently.",
      compatibilityRisk: "high",
      mustTrack: [
        "known conflict classes",
        "severity policy",
        "phone handling policy",
        "laptop/desktop deferral policy",
      ],
      phoneConstraint: [
        "phone may classify bounded local conflicts",
        "phone should defer heavy conflict review",
      ],
      laptopDesktopResponsibility: [
        "review large-window classification mismatches",
        "prepare compact classification summaries",
      ],
      mismatchMustExplain: [
        "which conflict class differs",
        "whether severity differs",
        "whether repair planning depends on the difference",
      ],
      mustNeverDo: [
        "repair without classification",
        "hide conflict type",
        "collapse contested correction into confirmed truth",
      ],
      ledgerRule:
        "Conflict classification must explain disagreement using packet-ledger evidence.",
      deltaOnlyRule:
        "Classification compatibility should move compact summaries.",
      deterministicStateRule:
        "Same evidence and same policy should classify conflicts the same way.",
      futureNativeBoundary:
        "Conflict classification compatibility should eventually move behind native repair boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "repair_planning",
      purpose:
        "Tracks compatibility for repair planning so devices do not prepare incompatible repair paths.",
      compatibilityRisk: "high",
      mustTrack: [
        "repair plan names",
        "allowed repair outputs",
        "forbidden repair outputs",
        "preferred device class for repair planning",
      ],
      phoneConstraint: [
        "phone may follow bounded repair plans",
        "phone should avoid heavy repair planning",
      ],
      laptopDesktopResponsibility: [
        "review large repair plans",
        "prepare phone-safe repair guidance",
      ],
      mismatchMustExplain: [
        "which repair plan differs",
        "whether the repair output is allowed",
        "whether phone budget is affected",
      ],
      mustNeverDo: [
        "execute unplanned repair",
        "invent non-ledger truth",
        "use repeated unchanged full-state sync as repair",
      ],
      ledgerRule:
        "Repair planning must converge toward valid packet-ledger state.",
      deltaOnlyRule:
        "Repair planning should produce deltas, cursor windows, compact summaries, or phone-safe guidance.",
      deterministicStateRule:
        "Same conflict and same policy should produce compatible repair planning.",
      futureNativeBoundary:
        "Repair plan compatibility should eventually move behind Rust/WASM/native repair boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "repair_execution_guard",
      purpose:
        "Tracks compatibility for guardrails required before future repair execution.",
      compatibilityRisk: "must_not_silently_merge",
      mustTrack: [
        "packet-ledger evidence requirement",
        "classified conflict requirement",
        "repair plan requirement",
        "phone budget guard",
        "delta-only output guard",
        "tombstone safety guard",
        "correction threshold guard",
        "deterministic replay guard",
        "portability integrity guard",
      ],
      phoneConstraint: [
        "phone may apply only bounded future repair outputs",
        "phone should block or defer when guard compatibility is unclear",
      ],
      laptopDesktopResponsibility: [
        "review guard mismatch",
        "prepare compatibility diagnostics",
        "avoid becoming central repair authority",
      ],
      mismatchMustExplain: [
        "which guard differs",
        "whether execution must be blocked",
        "whether laptop/desktop review is needed",
      ],
      mustNeverDo: [
        "execute repair when guard compatibility is unknown",
        "silently merge incompatible repair guard policies",
        "allow weak correction finalization",
        "allow tombstone resurrection",
      ],
      ledgerRule:
        "Repair execution guards must preserve packet-ledger truth.",
      deltaOnlyRule:
        "Guard compatibility should be exchanged as compact summaries, not full-state sync.",
      deterministicStateRule:
        "Same guard policy and same evidence should allow, block, or defer repair consistently.",
      futureNativeBoundary:
        "Repair execution guard compatibility should eventually move behind native enforcement boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "derived_state_rules",
      purpose:
        "Tracks derived-state rule compatibility for phrase, meaning, correction, tombstone, identity, settings, diagnostics, and portability-derived state.",
      compatibilityRisk: "must_not_silently_merge",
      mustTrack: [
        "phrase derivation policy",
        "meaning scoring policy",
        "correction threshold policy",
        "tombstone active/inactive policy",
        "identity/settings derivation policy",
        "diagnostics summary policy",
      ],
      phoneConstraint: [
        "phone may track bounded derived-state policy metadata",
        "phone should defer deep mismatch review",
      ],
      laptopDesktopResponsibility: [
        "compare derived-state policy versions",
        "run deeper deterministic replay diagnostics",
        "prepare compact mismatch summaries",
      ],
      mismatchMustExplain: [
        "which derived-state rule differs",
        "whether same packets may produce different state",
        "whether policy upgrade/migration review is needed",
      ],
      mustNeverDo: [
        "hide derived-state policy mismatch",
        "manual patch derived state outside packets",
        "pretend same packets guarantee same state when rules differ",
      ],
      ledgerRule:
        "Derived state must remain reproducible from valid packets and compatible policy rules.",
      deltaOnlyRule:
        "Derived-state policy updates should move as compact policy metadata and summaries.",
      deterministicStateRule:
        "Same valid packets require compatible derivation rules to guarantee same derived state.",
      futureNativeBoundary:
        "Derived-state compatibility should eventually move behind Rust/WASM/native deterministic replay boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "future_native_boundary",
      purpose:
        "Tracks compatibility expectations for future Rust/WASM/native enforcement boundaries without implementing them now.",
      compatibilityRisk: "moderate",
      mustTrack: [
        "which checks are TypeScript architecture-only",
        "which checks should later move native",
        "which checks are critical enforcement candidates",
      ],
      phoneConstraint: [
        "phone may depend on future mobile-safe native boundaries",
        "phone should not assume TypeScript-only enforcement is final",
      ],
      laptopDesktopResponsibility: [
        "support heavier future native validation paths",
        "prepare diagnostics for enforcement mismatch",
      ],
      mismatchMustExplain: [
        "which enforcement boundary is missing or advisory-only",
        "whether runtime behavior depends on unavailable native enforcement",
      ],
      mustNeverDo: [
        "pretend advisory TypeScript constants are final security enforcement",
        "silently run critical enforcement without compatible boundary support",
      ],
      ledgerRule:
        "Native-boundary compatibility must protect packet-ledger truth.",
      deltaOnlyRule:
        "Native-boundary compatibility should move compact support summaries.",
      deterministicStateRule:
        "Critical native enforcement differences must not silently produce different derived state.",
      futureNativeBoundary:
        "This area itself should later be represented by explicit Rust/WASM/native capability checks.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
