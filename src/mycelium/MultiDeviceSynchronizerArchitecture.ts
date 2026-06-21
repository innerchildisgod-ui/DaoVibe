export type MyceliumDeviceClass = "laptop_desktop" | "phone";

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
  readonly deviceClass: MyceliumDeviceClass;
  readonly purpose: string;
  readonly responsibilities: readonly string[];
  readonly constraints: readonly string[];
}

export interface MyceliumMultiDeviceSynchronizerRules {
  readonly packetLedgerRemainsSourceOfTruth: true;
  readonly syncUnit: "changes_deltas_events";
  readonly noRepeatedUnchangedStateTransmission: true;
  readonly sameValidPacketsDeriveSameStateOnEveryDevice: true;
  readonly oneProtocolCoreMultipleDeviceShells: true;
  readonly phoneNodesAreRealBoundedPeers: true;
  readonly laptopDesktopPreferredForHeavyReconciliation: true;
}

export interface MyceliumSynchronizerArchitecture {
  readonly name: MyceliumSynchronizerName;
  readonly purpose: string;
  readonly sourceOfTruth: string;
  readonly maySync: readonly string[];
  readonly mustNotSync: readonly string[];
  readonly preferredDeviceClass: MyceliumDeviceClass;
  readonly phoneConstraints: readonly string[];
  readonly laptopDesktopResponsibilities: readonly string[];
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSynchronizerRuntimeStatus;
}

export interface MyceliumMultiDeviceSynchronizerArchitecture {
  readonly productLayer: "DAOVibe Mycelium";
  readonly runtimeStatus: MyceliumSynchronizerRuntimeStatus;
  readonly architectureOnly: true;
  readonly runtimeEffects: readonly string[];
  readonly orchestratorBoundary: string;
  readonly deviceClasses: readonly MyceliumDeviceClassArchitecture[];
  readonly coreRules: MyceliumMultiDeviceSynchronizerRules;
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

export const MYCELIUM_MULTI_DEVICE_SYNCHRONIZER_RULES = {
  packetLedgerRemainsSourceOfTruth: true,
  syncUnit: "changes_deltas_events",
  noRepeatedUnchangedStateTransmission: true,
  sameValidPacketsDeriveSameStateOnEveryDevice: true,
  oneProtocolCoreMultipleDeviceShells: true,
  phoneNodesAreRealBoundedPeers: true,
  laptopDesktopPreferredForHeavyReconciliation: true,
} as const satisfies MyceliumMultiDeviceSynchronizerRules;

export const MYCELIUM_MULTI_DEVICE_SYNCHRONIZER_ARCHITECTURE = {
  productLayer: "DAOVibe Mycelium",
  runtimeStatus: "architecture_only",
  architectureOnly: true,
  runtimeEffects: [
    "Exports inert TypeScript types and constants only.",
    "Performs no I/O, networking, storage writes, timers, background tasks, or runtime registration.",
    "Does not change existing Mycelium sync behavior or simulations.",
  ],
  orchestratorBoundary:
    "Synchronizers define Mycelium architecture boundaries and app glue. Future orchestrators are low-level native boundaries; critical enforcement belongs behind Rust, WASM, or native code.",
  deviceClasses: [
    {
      deviceClass: "laptop_desktop",
      purpose:
        "Heavier local Mycelium node class for compute, storage, validation, diagnostics, indexing, export/import, and reconciliation.",
      responsibilities: [
        "Prefer indexing and diagnostics work.",
        "Prefer ledger export/import preparation and validation.",
        "Prefer bulk validation, sync reconciliation, and packet audits.",
        "Act as the preferred shell for future native-boundary enforcement.",
      ],
      constraints: [
        "Remain a device shell around the same Mycelium protocol core.",
        "Treat the packet ledger as the source of truth.",
        "Do not change existing sync behavior from this architecture surface.",
      ],
    },
    {
      deviceClass: "phone",
      purpose:
        "Lightweight mobile Mycelium peer node with bounded local state and offline participation.",
      responsibilities: [
        "Participate as a real bounded peer node.",
        "Support battery-aware, bounded-storage, app-store-safe, offline-capable local operation.",
        "Handle lightweight phrase, meaning, correction, identity, settings, and bounded packet-delta participation.",
      ],
      constraints: [
        "Avoid heavy reconciliation unless explicitly allowed by future policy.",
        "Avoid large ledger scans and sustained background work.",
        "Prefer changes, deltas, and events over repeated state transmission.",
      ],
    },
  ],
  coreRules: MYCELIUM_MULTI_DEVICE_SYNCHRONIZER_RULES,
  synchronizers: [
    {
      name: "packet",
      purpose:
        "Move valid packet-ledger changes between device shells without transmitting unchanged derived state.",
      sourceOfTruth: "Mycelium packet ledger",
      maySync: [
        "new valid packets",
        "packet cursors",
        "packet delta manifests",
        "packet integrity summaries",
      ],
      mustNotSync: [
        "unchanged packet state repeatedly",
        "derived phrase or meaning snapshots as packet truth",
        "invalid packet blobs",
        "transport secrets or private keys",
      ],
      preferredDeviceClass: "laptop_desktop",
      phoneConstraints: [
        "Use bounded packet windows.",
        "Avoid full-ledger scans during ordinary mobile operation.",
        "Defer heavy validation or reconciliation unless explicitly allowed by future policy.",
      ],
      laptopDesktopResponsibilities: [
        "Run larger validation windows.",
        "Maintain packet indexes.",
        "Prepare ledger export/import material.",
        "Audit packet deltas and packet gaps.",
      ],
      futureNativeBoundary:
        "Packet validation, hash verification, replay protection, delta integrity checks, and ledger admission should move behind a Rust, WASM, or native Mycelium boundary.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "phrase",
      purpose:
        "Keep phrase observations aligned as packet-derived changes rather than repeated phrase-state snapshots.",
      sourceOfTruth: "phrase observation packets in the Mycelium packet ledger",
      maySync: [
        "phrase observation packet deltas",
        "phrase index update events",
        "phrase cursor positions",
      ],
      mustNotSync: [
        "unchanged phrase indexes repeatedly",
        "raw private audio or capture buffers",
        "phrase state not backed by valid packets",
      ],
      preferredDeviceClass: "phone",
      phoneConstraints: [
        "Keep local phrase indexes bounded.",
        "Avoid background reindexing of large ledgers.",
        "Prefer user-visible local phrase participation.",
      ],
      laptopDesktopResponsibilities: [
        "Build and repair larger phrase indexes.",
        "Run phrase diagnostics from packet-derived state.",
        "Compare phrase derivation across packet windows.",
      ],
      futureNativeBoundary:
        "Deterministic phrase-index derivation and large-index verification should move behind a Rust, WASM, or native Mycelium boundary when enforcement is required.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "meaning",
      purpose:
        "Synchronize meaning proposals and votes as packet-derived deltas that converge to the same meaning state.",
      sourceOfTruth: "meaning proposal and vote packets in the Mycelium packet ledger",
      maySync: [
        "meaning proposal packet deltas",
        "meaning vote packet deltas",
        "meaning derivation checkpoints reproducible from packets",
      ],
      mustNotSync: [
        "unchanged meaning state repeatedly",
        "unverifiable meaning summaries as source of truth",
        "model weights or private inference artifacts",
      ],
      preferredDeviceClass: "phone",
      phoneConstraints: [
        "Participate with bounded proposal and vote windows.",
        "Avoid heavyweight meaning reconciliation unless explicitly allowed by future policy.",
        "Keep derived meaning views reproducible from valid local packets.",
      ],
      laptopDesktopResponsibilities: [
        "Run bulk meaning validation.",
        "Compare derived meaning state across packet windows.",
        "Audit meaning proposal and vote histories.",
      ],
      futureNativeBoundary:
        "Meaning reduction, vote validation, and deterministic conflict handling should move behind a Rust, WASM, or native Mycelium boundary when they become critical enforcement.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "correction",
      purpose:
        "Synchronize correction proposals and votes without treating advisory controller state as truth.",
      sourceOfTruth: "correction proposal and vote packets in the Mycelium packet ledger",
      maySync: [
        "correction proposal packet deltas",
        "correction vote packet deltas",
        "correction maturity events derived from valid packets",
      ],
      mustNotSync: [
        "manual correction state not backed by packets",
        "cleanup commands",
        "private moderator notes",
        "unchanged correction views repeatedly",
      ],
      preferredDeviceClass: "phone",
      phoneConstraints: [
        "Allow lightweight correction participation.",
        "Avoid bulk correction-history reconciliation unless explicitly allowed by future policy.",
        "Keep correction views bounded to available packet windows.",
      ],
      laptopDesktopResponsibilities: [
        "Run correction-history diagnostics.",
        "Validate correction maturity across larger packet windows.",
        "Audit correction conflicts from packet-derived state.",
      ],
      futureNativeBoundary:
        "Correction admission, vote thresholds, maturity scoring, and conflict reconciliation should move behind a Rust, WASM, or native Mycelium boundary when they enforce truth.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "tombstone",
      purpose:
        "Synchronize tombstone proposals and votes while keeping destructive execution outside TypeScript sync controllers.",
      sourceOfTruth: "tombstone proposal and vote packets in the Mycelium packet ledger",
      maySync: [
        "tombstone proposal packet deltas",
        "tombstone vote packet deltas",
        "non-destructive tombstone preview events",
      ],
      mustNotSync: [
        "delete commands",
        "ledger pruning commands",
        "destructive tombstone execution",
        "unrelated packet payloads",
      ],
      preferredDeviceClass: "laptop_desktop",
      phoneConstraints: [
        "Display and vote on bounded tombstone information.",
        "Do not run destructive execution.",
        "Avoid full-ledger tombstone scans unless explicitly allowed by future policy.",
      ],
      laptopDesktopResponsibilities: [
        "Run tombstone diagnostics and maturity checks.",
        "Prepare auditable previews before future native enforcement.",
        "Audit tombstone histories against packet-ledger rules.",
      ],
      futureNativeBoundary:
        "Any irreversible tombstone execution, pruning guard, authorization check, or deletion-adjacent enforcement must live behind a Rust, WASM, or native Mycelium boundary.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "identity",
      purpose:
        "Synchronize safe Mycelium identity metadata without leaking private device or key material.",
      sourceOfTruth: "identity packets or explicitly ledger-bound identity metadata",
      maySync: [
        "public node identity metadata",
        "identity rotation events represented as valid packets",
        "safe capability declarations",
      ],
      mustNotSync: [
        "private keys",
        "device secrets",
        "raw contact lists",
        "platform account tokens",
        "unbounded device fingerprints",
      ],
      preferredDeviceClass: "phone",
      phoneConstraints: [
        "Keep identity sync compatible with mobile platform rules.",
        "Keep private material local to the device or native secure storage.",
        "Avoid unbounded device fingerprint sharing.",
      ],
      laptopDesktopResponsibilities: [
        "Validate public identity metadata against packet history.",
        "Assist identity diagnostics without taking ownership of private keys.",
        "Audit identity rotation history when represented as packets.",
      ],
      futureNativeBoundary:
        "Signature verification, identity rotation rules, secure key access, and private-material isolation should move behind a Rust, WASM, or native Mycelium boundary.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "settings",
      purpose:
        "Define how explicit Mycelium settings changes may synchronize while preserving local-only device preferences.",
      sourceOfTruth:
        "settings events in the Mycelium packet ledger when shared; otherwise local device settings remain local",
      maySync: [
        "user-approved Mycelium preference changes",
        "settings cursors",
        "safe capability preferences",
      ],
      mustNotSync: [
        "credentials",
        "platform privacy settings",
        "battery policy overrides",
        "local-only debug flags unless explicitly packetized",
      ],
      preferredDeviceClass: "phone",
      phoneConstraints: [
        "Respect mobile battery and privacy controls.",
        "Do not override local platform settings through sync.",
        "Keep shared settings explicit and bounded.",
      ],
      laptopDesktopResponsibilities: [
        "Validate settings-event history when packetized.",
        "Help diagnose settings drift without forcing local changes.",
        "Audit settings derivation from packet history.",
      ],
      futureNativeBoundary:
        "Policy-gated settings admission, capability checks, and local secure-setting boundaries should move behind a Rust, WASM, or native Mycelium boundary when enforcement is required.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "diagnostics",
      purpose:
        "Synchronize bounded diagnostic events that explain sync health without changing packet truth.",
      sourceOfTruth:
        "valid Mycelium packet ledger plus reproducible local diagnostic observations",
      maySync: [
        "bounded health summaries",
        "packet gap reports",
        "reproducible ledger statistics",
        "version and capability summaries",
      ],
      mustNotSync: [
        "private packet contents",
        "raw logs with secrets",
        "continuous telemetry streams",
        "diagnostic data that changes packet truth",
      ],
      preferredDeviceClass: "laptop_desktop",
      phoneConstraints: [
        "Keep diagnostics bounded and user-visible where possible.",
        "Avoid continuous background telemetry.",
        "Avoid large diagnostic exports during ordinary mobile operation.",
      ],
      laptopDesktopResponsibilities: [
        "Run deeper diagnostics.",
        "Compare packet windows and derived-state summaries.",
        "Prepare human-readable sync reports.",
      ],
      futureNativeBoundary:
        "Sensitive diagnostic redaction, signed local attestations, and integrity proofs should move behind a Rust, WASM, or native Mycelium boundary when diagnostics become enforceable.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ledger_portability",
      purpose:
        "Define portable import/export boundaries for packet ledgers without introducing packaging or remote-backup behavior.",
      sourceOfTruth: "valid Mycelium packet ledger export/import material",
      maySync: [
        "ledger export manifests",
        "valid packet bundles",
        "import cursors",
        "integrity summaries",
      ],
      mustNotSync: [
        "derived caches as source of truth",
        "invalid packet bundles",
        "credentials",
        "remote backup artifacts",
        "application installation packages",
      ],
      preferredDeviceClass: "laptop_desktop",
      phoneConstraints: [
        "Avoid bulk import/export unless explicitly allowed by future policy.",
        "Prefer bounded import previews.",
        "Respect storage and battery limits.",
      ],
      laptopDesktopResponsibilities: [
        "Prepare ledger exports.",
        "Validate imports before admission.",
        "Run bulk packet integrity checks.",
        "Support future native enforcement for portability validation.",
      ],
      futureNativeBoundary:
        "Ledger export/import validation, manifest verification, schema checks, and bulk packet integrity enforcement should move behind a Rust, WASM, or native Mycelium boundary.",
      runtimeStatus: "architecture_only",
    },
  ],
} as const satisfies MyceliumMultiDeviceSynchronizerArchitecture;
