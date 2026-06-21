export type MyceliumDeviceClass = "phone" | "laptop" | "desktop";

export type MyceliumPreferredDeviceClass =
  | MyceliumDeviceClass
  | "laptop_desktop"
  | "any";

export type MyceliumSynchronizerName =
  | "packet"
  | "phrase"
  | "meaning"
  | "correction"
  | "tombstone"
  | "identity"
  | "settings"
  | "diagnostics"
  | "ledger_portability";

export type MyceliumSynchronizerRuntimeStatus = "architecture_only";

export interface MyceliumDeviceClassArchitecture {
  readonly device_class: MyceliumDeviceClass;
  readonly purpose: string;
  readonly characteristics: readonly string[];
  readonly preferred_work: readonly string[];
  readonly constraints: readonly string[];
}

export interface MyceliumMultiDeviceCoreRule {
  readonly packet_ledger_is_source_of_truth: true;
  readonly sync_unit: "changes_deltas_events";
  readonly no_repeated_unchanged_state_transmission: true;
  readonly deterministic_derivation_rule: string;
  readonly protocol_shape: "one_protocol_core_multiple_device_shells";
}

export interface MyceliumSynchronizerArchitecture {
  readonly name: MyceliumSynchronizerName;
  readonly purpose: string;
  readonly source_of_truth: string;
  readonly may_sync: readonly string[];
  readonly must_not_sync: readonly string[];
  readonly preferred_device_class: MyceliumPreferredDeviceClass;
  readonly phone_constraints: readonly string[];
  readonly laptop_desktop_responsibilities: readonly string[];
  readonly future_native_rust_wasm_enforcement_boundary: string;
  readonly runtime_status: MyceliumSynchronizerRuntimeStatus;
}

export interface MyceliumMultiDeviceSynchronizerArchitecture {
  readonly product_layer: "DAOVibe Mycelium";
  readonly runtime_status: MyceliumSynchronizerRuntimeStatus;
  readonly runtime_effects: readonly string[];
  readonly out_of_scope: readonly string[];
  readonly orchestrator_boundary_note: string;
  readonly device_classes: readonly MyceliumDeviceClassArchitecture[];
  readonly core_rule: MyceliumMultiDeviceCoreRule;
  readonly synchronizers: readonly MyceliumSynchronizerArchitecture[];
}

export const MYCELIUM_SYNCHRONIZER_NAMES = [
  "packet",
  "phrase",
  "meaning",
  "correction",
  "tombstone",
  "identity",
  "settings",
  "diagnostics",
  "ledger_portability",
] as const satisfies readonly MyceliumSynchronizerName[];

export const MYCELIUM_MULTI_DEVICE_SYNCHRONIZER_ARCHITECTURE = {
  product_layer: "DAOVibe Mycelium",
  runtime_status: "architecture_only",
  runtime_effects: [
    "Exports inert TypeScript constants and types only.",
    "Does not perform I/O, networking, storage writes, timers, cloud calls, peer discovery, background tasks, or runtime registration.",
    "Does not change existing Mycelium sync behavior.",
  ],
  out_of_scope: [
    "EEE",
    "SBP",
    "marketplace",
    "Student Nodes",
    "cloud sync",
    "peer discovery",
    "mobile app implementation",
    "desktop packaging",
  ],
  orchestrator_boundary_note:
    "Synchronizers define TypeScript architecture boundaries and advisory app glue only; critical enforcement belongs in a future Rust, WASM, or native Mycelium core boundary.",
  device_classes: [
    {
      device_class: "phone",
      purpose: "Lightweight mobile peer node for local-first Mycelium participation.",
      characteristics: [
        "battery-aware",
        "bounded storage",
        "app-store-safe",
        "offline-capable",
        "able to participate as a peer",
      ],
      preferred_work: [
        "local phrase observation",
        "lightweight meaning and correction participation",
        "identity and settings interaction",
        "bounded packet delta exchange",
      ],
      constraints: [
        "Avoid heavy reconciliation unless explicitly allowed.",
        "Avoid large ledger scans and long background work.",
        "Prefer sync-efficient changes, deltas, and events.",
      ],
    },
    {
      device_class: "laptop",
      purpose:
        "Heavier compute, storage, validation, diagnostics, export/import, and reconciliation node.",
      characteristics: [
        "larger local storage",
        "stronger sustained compute",
        "better suited to diagnostics and indexing",
        "candidate shell for later native-boundary enforcement",
      ],
      preferred_work: [
        "indexing",
        "diagnostics",
        "ledger export/import",
        "bulk validation",
        "sync reconciliation",
        "future native-boundary enforcement",
      ],
      constraints: [
        "Remain local-first.",
        "Do not introduce cloud sync or peer discovery in this architecture.",
      ],
    },
    {
      device_class: "desktop",
      purpose:
        "High-capacity local Mycelium node for heavier validation, storage, diagnostics, and reconciliation.",
      characteristics: [
        "largest expected local storage",
        "stable compute availability",
        "well suited to ledger portability and bulk checks",
        "candidate shell for later native-boundary enforcement",
      ],
      preferred_work: [
        "indexing",
        "diagnostics",
        "ledger export/import",
        "bulk validation",
        "sync reconciliation",
        "future native-boundary enforcement",
      ],
      constraints: [
        "Remain a device shell around the same protocol core.",
        "Do not change packet truth or existing sync behavior.",
      ],
    },
  ],
  core_rule: {
    packet_ledger_is_source_of_truth: true,
    sync_unit: "changes_deltas_events",
    no_repeated_unchanged_state_transmission: true,
    deterministic_derivation_rule:
      "The same valid packet ledger must derive the same Mycelium state on every device.",
    protocol_shape: "one_protocol_core_multiple_device_shells",
  },
  synchronizers: [
    {
      name: "packet",
      purpose:
        "Move valid packet ledger changes between device shells without transmitting unchanged derived state.",
      source_of_truth: "Mycelium packet ledger",
      may_sync: [
        "new valid packets",
        "packet cursors",
        "packet delta manifests",
        "packet integrity summaries",
      ],
      must_not_sync: [
        "unchanged packet state repeatedly",
        "derived phrase or meaning snapshots as packet truth",
        "invalid packet blobs",
        "transport secrets or private keys",
      ],
      preferred_device_class: "laptop_desktop",
      phone_constraints: [
        "Use bounded packet windows.",
        "Avoid full-ledger scans during normal mobile operation.",
        "Defer heavy validation or reconciliation unless explicitly allowed.",
      ],
      laptop_desktop_responsibilities: [
        "Run larger validation windows.",
        "Maintain packet indexes.",
        "Prepare ledger export/import material.",
        "Reconcile packet gaps with local peers when protocol support exists.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Packet validation, hash verification, replay protection, delta integrity checks, and ledger admission should move behind a Rust, WASM, or native core boundary.",
      runtime_status: "architecture_only",
    },
    {
      name: "phrase",
      purpose:
        "Keep phrase observations aligned as packet-derived changes rather than repeated phrase-state snapshots.",
      source_of_truth: "phrase observation packets in the Mycelium packet ledger",
      may_sync: [
        "phrase observation packet deltas",
        "phrase index update events",
        "phrase cursor positions",
      ],
      must_not_sync: [
        "unchanged phrase indexes repeatedly",
        "raw private audio or capture buffers",
        "phrase state not backed by valid packets",
      ],
      preferred_device_class: "any",
      phone_constraints: [
        "Keep local phrase indexes bounded.",
        "Avoid background reindexing of large ledgers.",
      ],
      laptop_desktop_responsibilities: [
        "Build and repair larger phrase indexes.",
        "Run phrase diagnostics from packet-derived state.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Deterministic phrase-index derivation and large-index verification should move behind a Rust, WASM, or native boundary when enforcement is required.",
      runtime_status: "architecture_only",
    },
    {
      name: "meaning",
      purpose:
        "Synchronize meaning proposals and votes as packet-derived deltas that converge to the same meaning state.",
      source_of_truth: "meaning proposal and vote packets in the Mycelium packet ledger",
      may_sync: [
        "meaning proposal packet deltas",
        "meaning vote packet deltas",
        "meaning derivation checkpoints that are reproducible from packets",
      ],
      must_not_sync: [
        "unchanged meaning state repeatedly",
        "unverifiable meaning summaries as source of truth",
        "model weights or private inference artifacts",
      ],
      preferred_device_class: "any",
      phone_constraints: [
        "Participate with bounded proposal and vote windows.",
        "Avoid heavyweight meaning reconciliation unless explicitly allowed.",
      ],
      laptop_desktop_responsibilities: [
        "Run bulk meaning validation.",
        "Compare derived meaning state across packet windows.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Meaning reduction, vote validation, and deterministic conflict handling should move behind a Rust, WASM, or native boundary when they become critical enforcement.",
      runtime_status: "architecture_only",
    },
    {
      name: "correction",
      purpose:
        "Synchronize correction proposals and votes without treating advisory controller state as truth.",
      source_of_truth: "correction proposal and vote packets in the Mycelium packet ledger",
      may_sync: [
        "correction proposal packet deltas",
        "correction vote packet deltas",
        "correction maturity events derived from valid packets",
      ],
      must_not_sync: [
        "manual correction state not backed by packets",
        "cleanup commands",
        "private moderator notes",
        "unchanged correction views repeatedly",
      ],
      preferred_device_class: "any",
      phone_constraints: [
        "Allow lightweight correction participation.",
        "Avoid bulk correction-history reconciliation unless explicitly allowed.",
      ],
      laptop_desktop_responsibilities: [
        "Run correction-history diagnostics.",
        "Validate correction maturity across larger packet windows.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Correction admission, vote thresholds, maturity scoring, and conflict reconciliation should move behind a Rust, WASM, or native boundary when they enforce truth.",
      runtime_status: "architecture_only",
    },
    {
      name: "tombstone",
      purpose:
        "Synchronize tombstone proposals and votes while keeping destructive execution outside TypeScript sync controllers.",
      source_of_truth: "tombstone proposal and vote packets in the Mycelium packet ledger",
      may_sync: [
        "tombstone proposal packet deltas",
        "tombstone vote packet deltas",
        "non-destructive tombstone preview events",
      ],
      must_not_sync: [
        "delete commands",
        "ledger pruning commands",
        "destructive tombstone execution",
        "unrelated packet payloads",
      ],
      preferred_device_class: "laptop_desktop",
      phone_constraints: [
        "Display and vote on bounded tombstone information.",
        "Do not run destructive execution.",
        "Avoid full-ledger tombstone scans unless explicitly allowed.",
      ],
      laptop_desktop_responsibilities: [
        "Run tombstone diagnostics and maturity checks.",
        "Prepare auditable previews before any future native enforcement.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Any irreversible tombstone execution, pruning guard, authorization check, or deletion-adjacent enforcement must live behind a Rust, WASM, or native boundary.",
      runtime_status: "architecture_only",
    },
    {
      name: "identity",
      purpose:
        "Synchronize safe Mycelium identity metadata without leaking private device or key material.",
      source_of_truth: "identity packets or explicitly ledger-bound identity metadata",
      may_sync: [
        "public node identity metadata",
        "identity rotation events when represented as valid packets",
        "safe capability declarations",
      ],
      must_not_sync: [
        "private keys",
        "device secrets",
        "raw contact lists",
        "platform account tokens",
        "unbounded device fingerprints",
      ],
      preferred_device_class: "phone",
      phone_constraints: [
        "Keep identity sync app-store-safe.",
        "Keep private material local to the device or native secure storage.",
      ],
      laptop_desktop_responsibilities: [
        "Validate public identity metadata against packet history.",
        "Assist identity diagnostics without taking ownership of private keys.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Signature verification, identity rotation rules, secure key access, and private-material isolation should move behind a Rust, WASM, or native boundary.",
      runtime_status: "architecture_only",
    },
    {
      name: "settings",
      purpose:
        "Define how explicit Mycelium settings changes may synchronize while preserving local-only device preferences.",
      source_of_truth:
        "explicit settings events when packetized; otherwise local device settings remain local",
      may_sync: [
        "user-approved Mycelium preference changes",
        "settings cursors",
        "safe capability preferences",
      ],
      must_not_sync: [
        "credentials",
        "platform privacy settings",
        "battery policy overrides",
        "local-only debug flags unless explicitly packetized",
      ],
      preferred_device_class: "phone",
      phone_constraints: [
        "Respect mobile battery and privacy controls.",
        "Do not override local platform settings through sync.",
      ],
      laptop_desktop_responsibilities: [
        "Validate settings-event history when packetized.",
        "Help diagnose settings drift without forcing local changes.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Policy-gated settings admission, capability checks, and local secure-setting boundaries should move behind a Rust, WASM, or native boundary when enforcement is required.",
      runtime_status: "architecture_only",
    },
    {
      name: "diagnostics",
      purpose:
        "Synchronize bounded diagnostic events that explain sync health without changing packet truth.",
      source_of_truth:
        "local diagnostic observations plus reproducible packet-ledger summaries",
      may_sync: [
        "bounded health summaries",
        "packet gap reports",
        "reproducible ledger statistics",
        "version and capability summaries",
      ],
      must_not_sync: [
        "private packet contents",
        "raw logs with secrets",
        "continuous telemetry streams",
        "cloud diagnostics",
      ],
      preferred_device_class: "laptop_desktop",
      phone_constraints: [
        "Keep diagnostics bounded and user-visible where possible.",
        "Avoid continuous background telemetry.",
      ],
      laptop_desktop_responsibilities: [
        "Run deeper diagnostics.",
        "Compare packet windows and derived-state summaries.",
        "Prepare human-readable sync reports.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Sensitive diagnostic redaction, signed local attestations, and integrity proofs should move behind a Rust, WASM, or native boundary when diagnostics become enforceable.",
      runtime_status: "architecture_only",
    },
    {
      name: "ledger_portability",
      purpose:
        "Define portable import/export boundaries for packet ledgers without introducing cloud backup or desktop packaging.",
      source_of_truth: "valid Mycelium packet ledger export/import material",
      may_sync: [
        "ledger export manifests",
        "valid packet bundles",
        "import cursors",
        "integrity summaries",
      ],
      must_not_sync: [
        "derived caches as source of truth",
        "invalid packet bundles",
        "credentials",
        "cloud backup artifacts",
        "application installation packages",
      ],
      preferred_device_class: "laptop_desktop",
      phone_constraints: [
        "Avoid bulk import/export unless explicitly allowed.",
        "Prefer bounded import previews.",
        "Respect storage and battery limits.",
      ],
      laptop_desktop_responsibilities: [
        "Prepare ledger exports.",
        "Validate imports before admission.",
        "Run bulk packet integrity checks.",
        "Support future native enforcement for portability validation.",
      ],
      future_native_rust_wasm_enforcement_boundary:
        "Ledger export/import validation, manifest verification, schema checks, and bulk packet integrity enforcement should move behind a Rust, WASM, or native boundary.",
      runtime_status: "architecture_only",
    },
  ],
} as const satisfies MyceliumMultiDeviceSynchronizerArchitecture;
