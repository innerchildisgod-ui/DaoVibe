export type MyceliumDeviceClass = "phone" | "laptop_desktop";

export type MyceliumCapabilityTier = "lightweight" | "standard" | "heavy";

export type MyceliumWorkloadCategory =
  | "packet_acceptance"
  | "packet_validation"
  | "phrase_indexing"
  | "meaning_indexing"
  | "correction_reconciliation"
  | "tombstone_reconciliation"
  | "identity_sync_review"
  | "settings_sync_review"
  | "diagnostics_scan"
  | "ledger_export"
  | "ledger_import"
  | "ledger_portability_review";

export type MyceliumCapabilityPolicyStatus = "architecture_only";

export interface MyceliumDeviceCapabilityDecision {
  readonly workload: MyceliumWorkloadCategory;
  readonly purpose: string;
  readonly phonePolicy: string;
  readonly laptopDesktopPolicy: string;
  readonly preferredDeviceClass: MyceliumDeviceClass;
  readonly maximumRecommendedPhoneRole: MyceliumCapabilityTier;
  readonly laptopDesktopResponsibility: MyceliumCapabilityTier;
  readonly futureNativeEnforcementBoundary: string;
  readonly runtimeStatus: MyceliumCapabilityPolicyStatus;
}

export interface MyceliumDeviceCapabilityCoreRules {
  readonly packetLedgerRemainsSourceOfTruth: true;
  readonly syncUnit: "changes_deltas_events";
  readonly noRepeatedUnchangedStateTransmission: true;
  readonly sameValidPacketsDeriveSameStateOnEveryDevice: true;
  readonly phoneNodesAreRealBoundedPeers: true;
  readonly phonesMayAcceptBoundedPacketDeltas: true;
  readonly phonesMayKeepLocalOfflineState: true;
  readonly phonesMayPerformLightweightValidationForSafeLocalUse: true;
  readonly phonesAvoidHeavyIndexingBulkReconciliationFullDiagnosticsAndLargeLedgerPortability: true;
  readonly laptopDesktopPreferredForHeavyValidationIndexingDiagnosticsReconciliationAndPortability: true;
  readonly criticalEnforcementMovesBehindRustWasmOrNativeBoundaries: true;
}

export interface MyceliumDeviceCapabilityPolicyBoundary {
  readonly productLayer: "DAOVibe Mycelium";
  readonly runtimeStatus: MyceliumCapabilityPolicyStatus;
  readonly architectureOnly: true;
  readonly runtimeEffects: readonly string[];
  readonly deviceClasses: readonly MyceliumDeviceClass[];
  readonly capabilityTiers: readonly MyceliumCapabilityTier[];
  readonly workloadCategories: readonly MyceliumWorkloadCategory[];
  readonly coreRules: MyceliumDeviceCapabilityCoreRules;
  readonly decisions: readonly MyceliumDeviceCapabilityDecision[];
}

export const MYCELIUM_DEVICE_CAPABILITY_CORE_RULES = {
  packetLedgerRemainsSourceOfTruth: true,
  syncUnit: "changes_deltas_events",
  noRepeatedUnchangedStateTransmission: true,
  sameValidPacketsDeriveSameStateOnEveryDevice: true,
  phoneNodesAreRealBoundedPeers: true,
  phonesMayAcceptBoundedPacketDeltas: true,
  phonesMayKeepLocalOfflineState: true,
  phonesMayPerformLightweightValidationForSafeLocalUse: true,
  phonesAvoidHeavyIndexingBulkReconciliationFullDiagnosticsAndLargeLedgerPortability: true,
  laptopDesktopPreferredForHeavyValidationIndexingDiagnosticsReconciliationAndPortability: true,
  criticalEnforcementMovesBehindRustWasmOrNativeBoundaries: true,
} as const satisfies MyceliumDeviceCapabilityCoreRules;

export const MYCELIUM_DEVICE_CAPABILITY_POLICY_BOUNDARY = {
  productLayer: "DAOVibe Mycelium",
  runtimeStatus: "architecture_only",
  architectureOnly: true,
  runtimeEffects: [
    "Exports inert TypeScript types and constants only.",
    "Performs no I/O, networking, storage writes, peer discovery, timers, background tasks, or runtime registration.",
    "Does not change existing Mycelium sync behavior or simulations.",
  ],
  deviceClasses: ["phone", "laptop_desktop"],
  capabilityTiers: ["lightweight", "standard", "heavy"],
  workloadCategories: [
    "packet_acceptance",
    "packet_validation",
    "phrase_indexing",
    "meaning_indexing",
    "correction_reconciliation",
    "tombstone_reconciliation",
    "identity_sync_review",
    "settings_sync_review",
    "diagnostics_scan",
    "ledger_export",
    "ledger_import",
    "ledger_portability_review",
  ],
  coreRules: MYCELIUM_DEVICE_CAPABILITY_CORE_RULES,
  decisions: [
    {
      workload: "packet_acceptance",
      purpose:
        "Describe which device class should accept bounded packet deltas while preserving packet-ledger truth.",
      phonePolicy:
        "Phones may accept bounded packet deltas, keep local/offline state, and preserve enough packet context for safe local use.",
      laptopDesktopPolicy:
        "Laptops/desktops may accept larger packet windows and prepare heavier packet admission review.",
      preferredDeviceClass: "phone",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "standard",
      futureNativeEnforcementBoundary:
        "Packet delta admission, replay protection, and integrity checks should move behind Rust, WASM, or native Mycelium boundaries when enforcement is required.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "packet_validation",
      purpose:
        "Describe where lightweight local checks end and heavier packet validation should be preferred.",
      phonePolicy:
        "Phones may run lightweight validation needed for safe local use, bounded packet windows, and user-visible local participation.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer heavy validation, larger packet-window checks, deterministic audits, and validation repair preparation.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Hash verification, signature verification, packet admission, and deterministic validation should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "phrase_indexing",
      purpose:
        "Describe how phrase indexes remain derived from valid packets without making phones rebuild large indexes.",
      phonePolicy:
        "Phones may keep bounded local phrase indexes and apply packet-derived phrase deltas for local/offline use.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer large phrase-index builds, repairs, and audits from packet-ledger material.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Deterministic phrase-index derivation and large-index verification should move behind Rust, WASM, or native Mycelium boundaries when enforcement is required.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "meaning_indexing",
      purpose:
        "Describe how meaning views stay reproducible from packets while bounding mobile indexing work.",
      phonePolicy:
        "Phones may maintain bounded meaning views for local use and apply small packet-derived meaning deltas.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer bulk meaning indexing, larger derivation checks, and cross-window meaning audits.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Meaning reduction, vote validation, conflict handling, and deterministic indexing should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "correction_reconciliation",
      purpose:
        "Describe where correction catch-up and conflict review should run without making advisory state authoritative.",
      phonePolicy:
        "Phones may review bounded correction deltas and maintain local correction views for participation.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer bulk correction reconciliation, conflict audits, and maturity review from valid packets.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Correction admission, vote thresholds, maturity scoring, and conflict reconciliation should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "tombstone_reconciliation",
      purpose:
        "Describe where tombstone proposal and vote reconciliation belongs while keeping destructive enforcement out of TypeScript policy data.",
      phonePolicy:
        "Phones may review bounded tombstone deltas and non-destructive previews for local participation.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer bulk tombstone reconciliation, maturity checks, and audit preparation from packet history.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Tombstone authorization checks, irreversible execution rules, pruning guards, and reconciliation enforcement must move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "identity_sync_review",
      purpose:
        "Describe how safe identity metadata review stays bounded and never turns private device material into sync data.",
      phonePolicy:
        "Phones may review bounded identity metadata deltas and keep local identity state needed for offline participation.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer public identity-history review, rotation audits, and packet-backed identity diagnostics.",
      preferredDeviceClass: "phone",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "standard",
      futureNativeEnforcementBoundary:
        "Signature verification, identity rotation rules, secure key access, and private-material isolation should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "settings_sync_review",
      purpose:
        "Describe how explicit settings deltas can be reviewed without overriding local-only device preferences.",
      phonePolicy:
        "Phones may review bounded settings deltas, keep local preferences local, and apply only explicit packet-backed shared settings.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer settings-history diagnostics, drift review, and packet-backed settings audit.",
      preferredDeviceClass: "phone",
      maximumRecommendedPhoneRole: "standard",
      laptopDesktopResponsibility: "standard",
      futureNativeEnforcementBoundary:
        "Policy-gated settings admission, secure local setting storage, and capability checks should move behind Rust, WASM, or native Mycelium boundaries when enforceable.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "diagnostics_scan",
      purpose:
        "Describe why deep diagnostics should be preferred on heavier devices while phones keep diagnostics bounded.",
      phonePolicy:
        "Phones may run bounded, user-visible diagnostics needed for safe local operation and should avoid full diagnostic scans.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer full diagnostic scans, packet-window comparisons, and derived-state verification.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Diagnostic redaction, signed local attestations, integrity proofs, and sensitive scan enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "ledger_export",
      purpose:
        "Describe why large ledger export preparation should be preferred on heavier devices while preserving packet-ledger truth.",
      phonePolicy:
        "Phones should avoid large ledger export work unless a future policy explicitly allows it; bounded export previews may be acceptable.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer ledger export preparation, manifest generation review, and bulk packet integrity checks.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Ledger export validation, manifest integrity checks, packet bundle verification, and portability proofs should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "ledger_import",
      purpose:
        "Describe why large ledger import review should be preferred on heavier devices before packet material is trusted.",
      phonePolicy:
        "Phones should avoid large ledger import work unless a future policy explicitly allows it; bounded import previews may be acceptable.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer import review, packet bundle validation, schema checks, and bulk integrity verification.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Ledger import validation, packet admission review, schema checks, and duplicate or conflict detection should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      workload: "ledger_portability_review",
      purpose:
        "Describe how portability decisions stay packet-ledger based and separate from runtime scheduling.",
      phonePolicy:
        "Phones may display bounded portability review state and should avoid sustained portability scans unless a future policy explicitly allows it.",
      laptopDesktopPolicy:
        "Laptops/desktops should prefer portability review, export/import audit preparation, and deterministic packet-ledger verification.",
      preferredDeviceClass: "laptop_desktop",
      maximumRecommendedPhoneRole: "lightweight",
      laptopDesktopResponsibility: "heavy",
      futureNativeEnforcementBoundary:
        "Ledger portability review, bundle integrity proofs, deterministic replay checks, and admission enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
  ],
} as const satisfies MyceliumDeviceCapabilityPolicyBoundary;
