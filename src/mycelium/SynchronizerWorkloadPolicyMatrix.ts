import type { MyceliumSynchronizerName } from "./MultiDeviceSynchronizerArchitecture";
import type {
  MyceliumDeviceClass,
  MyceliumWorkloadCategory,
} from "./DeviceCapabilityPolicyBoundary";

export type MyceliumSynchronizerWorkloadRuntimeStatus = "architecture_only";

export interface MyceliumSynchronizerWorkloadPolicyRules {
  readonly architectureOnly: true;
  readonly matrixIsNotScheduler: true;
  readonly matrixIsNotPeerDiscovery: true;
  readonly matrixIsNotSyncExecution: true;
  readonly matrixIsNotRuntimeEnforcement: true;
  readonly matrixIsNotCloudSync: true;
  readonly packetLedgerRemainsSourceOfTruth: true;
  readonly syncUnit: "changes_deltas_events";
  readonly noRepeatedUnchangedStateTransmission: true;
  readonly sameValidPacketsDeriveSameStateOnEveryDevice: true;
  readonly phonesAreRealBoundedPeers: true;
  readonly laptopDesktopPreferredForHeavyValidationIndexingDiagnosticsAndReconciliation: true;
  readonly futureCriticalEnforcementBehindRustWasmOrNativeBoundaries: true;
}

export interface MyceliumSynchronizerWorkloadPolicy {
  readonly synchronizerName: MyceliumSynchronizerName;
  readonly linkedWorkloads: readonly MyceliumWorkloadCategory[];
  readonly purpose: string;
  readonly phoneRole: string;
  readonly laptopDesktopRole: string;
  readonly preferredDeviceClass: MyceliumDeviceClass;
  readonly phoneAllowedWork: readonly string[];
  readonly phoneAvoidWork: readonly string[];
  readonly laptopDesktopPreferredWork: readonly string[];
  readonly mustNeverDo: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSynchronizerWorkloadRuntimeStatus;
}

export interface MyceliumSynchronizerWorkloadPolicyMatrix {
  readonly productLayer: "DAOVibe Mycelium";
  readonly runtimeStatus: MyceliumSynchronizerWorkloadRuntimeStatus;
  readonly architectureOnly: true;
  readonly runtimeEffects: readonly string[];
  readonly synchronizerNames: readonly MyceliumSynchronizerName[];
  readonly rules: MyceliumSynchronizerWorkloadPolicyRules;
  readonly policies: readonly MyceliumSynchronizerWorkloadPolicy[];
}

export const MYCELIUM_SYNCHRONIZER_WORKLOAD_POLICY_RULES = {
  architectureOnly: true,
  matrixIsNotScheduler: true,
  matrixIsNotPeerDiscovery: true,
  matrixIsNotSyncExecution: true,
  matrixIsNotRuntimeEnforcement: true,
  matrixIsNotCloudSync: true,
  packetLedgerRemainsSourceOfTruth: true,
  syncUnit: "changes_deltas_events",
  noRepeatedUnchangedStateTransmission: true,
  sameValidPacketsDeriveSameStateOnEveryDevice: true,
  phonesAreRealBoundedPeers: true,
  laptopDesktopPreferredForHeavyValidationIndexingDiagnosticsAndReconciliation: true,
  futureCriticalEnforcementBehindRustWasmOrNativeBoundaries: true,
} as const satisfies MyceliumSynchronizerWorkloadPolicyRules;

export const MYCELIUM_SYNCHRONIZER_WORKLOAD_POLICY_MATRIX = {
  productLayer: "DAOVibe Mycelium",
  runtimeStatus: "architecture_only",
  architectureOnly: true,
  runtimeEffects: [
    "Exports inert TypeScript types and constants only.",
    "Performs no I/O, networking, storage writes, peer discovery, cloud calls, timers, background tasks, runtime registration, sync execution, or scheduler execution.",
    "Does not change existing Mycelium sync behavior or simulations.",
  ],
  synchronizerNames: [
    "packet",
    "phrase",
    "meaning",
    "correction",
    "tombstone",
    "identity",
    "settings",
    "diagnostics",
    "ledger_portability",
  ],
  rules: MYCELIUM_SYNCHRONIZER_WORKLOAD_POLICY_RULES,
  policies: [
    {
      synchronizerName: "packet",
      linkedWorkloads: [
        "packet_acceptance",
        "packet_validation",
        "ledger_import",
        "ledger_export",
      ],
      purpose:
        "Connect packet movement to bounded phone acceptance and heavier laptop/desktop validation, import review, export review, and reconciliation.",
      phoneRole:
        "Accept bounded packet deltas and keep enough local packet context for safe offline Mycelium use.",
      laptopDesktopRole:
        "Prefer bulk packet validation, import review, export review, packet audits, and reconciliation.",
      preferredDeviceClass: "laptop_desktop",
      phoneAllowedWork: [
        "Accept bounded packet deltas.",
        "Keep local/offline packet state needed for safe use.",
        "Run lightweight packet checks for local safety.",
      ],
      phoneAvoidWork: [
        "Avoid full-ledger validation during ordinary mobile operation.",
        "Avoid bulk import/export review unless future policy explicitly allows it.",
        "Avoid repeated transmission of unchanged full packet state.",
      ],
      laptopDesktopPreferredWork: [
        "Run larger packet validation windows.",
        "Review imports and exports.",
        "Reconcile packet gaps and packet cursors.",
        "Audit packet integrity summaries.",
      ],
      mustNeverDo: [
        "Repeatedly sync unchanged full state.",
        "Treat derived state as packet-ledger truth.",
        "Admit invalid packet material as authoritative.",
      ],
      ledgerRule:
        "The Mycelium packet ledger remains the source of truth for packet synchronizer planning.",
      deltaOnlyRule:
        "Packet synchronizer planning should move packet changes, deltas, cursors, manifests, and events only.",
      futureNativeBoundary:
        "Packet validation, replay protection, ledger admission, delta integrity checks, and import/export verification should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "phrase",
      linkedWorkloads: ["phrase_indexing", "packet_acceptance", "diagnostics_scan"],
      purpose:
        "Connect phrase synchronization to bounded local lookup on phones and heavier phrase indexing or reconciliation on laptops/desktops.",
      phoneRole:
        "Use bounded local phrase lookup and accept phrase delta packets for local/offline participation.",
      laptopDesktopRole:
        "Prefer phrase indexing, phrase diagnostics, larger phrase reconciliation, and packet-derived phrase audits.",
      preferredDeviceClass: "phone",
      phoneAllowedWork: [
        "Maintain bounded local phrase lookup state.",
        "Accept phrase delta packets.",
        "Apply small packet-derived phrase index updates.",
      ],
      phoneAvoidWork: [
        "Avoid rebuilding large phrase indexes by default.",
        "Avoid full diagnostic scans for phrase state.",
        "Avoid relying on remote phrase state as required truth.",
      ],
      laptopDesktopPreferredWork: [
        "Build and repair larger phrase indexes.",
        "Run phrase diagnostics.",
        "Reconcile phrase state across larger packet windows.",
      ],
      mustNeverDo: [
        "Require remote phrase state.",
        "Treat phrase caches as a source of truth.",
        "Repeatedly sync unchanged phrase indexes.",
      ],
      ledgerRule:
        "Phrase state must remain derived from valid phrase packets in the Mycelium packet ledger.",
      deltaOnlyRule:
        "Phrase synchronizer planning should move phrase packet deltas, index update events, and cursors only.",
      futureNativeBoundary:
        "Deterministic phrase-index derivation, large-index verification, and phrase reconciliation enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "meaning",
      linkedWorkloads: [
        "meaning_indexing",
        "packet_acceptance",
        "packet_validation",
      ],
      purpose:
        "Connect meaning synchronization to local/offline meaning candidates on phones and heavier scoring, indexing, and reconciliation on laptops/desktops.",
      phoneRole:
        "Keep local/offline meaning candidates and apply bounded meaning proposal or vote updates.",
      laptopDesktopRole:
        "Prefer heavier meaning scoring, indexing, reconciliation, and packet-derived consistency checks.",
      preferredDeviceClass: "phone",
      phoneAllowedWork: [
        "Maintain bounded meaning candidates.",
        "Accept bounded meaning proposal and vote deltas.",
        "Use local/offline meaning views derived from valid packets.",
      ],
      phoneAvoidWork: [
        "Avoid heavy meaning scoring windows.",
        "Avoid bulk meaning-index reconstruction by default.",
        "Avoid repeated transmission of derived meaning state.",
      ],
      laptopDesktopPreferredWork: [
        "Run heavier meaning scoring checks.",
        "Build and audit larger meaning indexes.",
        "Reconcile meaning derivation across larger packet windows.",
      ],
      mustNeverDo: [
        "Repeatedly transmit derived meaning state when packets are unchanged.",
        "Treat unverifiable meaning summaries as source of truth.",
        "Let local scoring replace packet-ledger derivation.",
      ],
      ledgerRule:
        "Meaning state must remain reproducible from valid meaning proposal and vote packets.",
      deltaOnlyRule:
        "Meaning synchronizer planning should move meaning proposal deltas, vote deltas, and reproducible checkpoint events only.",
      futureNativeBoundary:
        "Meaning reduction, vote validation, scoring checks, deterministic indexing, and reconciliation enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "correction",
      linkedWorkloads: [
        "correction_reconciliation",
        "packet_acceptance",
        "packet_validation",
      ],
      purpose:
        "Connect correction synchronization to bounded phone proposal/vote deltas and heavier contested correction review on laptops/desktops.",
      phoneRole:
        "Accept bounded correction proposal and vote deltas for local participation and offline review.",
      laptopDesktopRole:
        "Prefer correction audits, contested correction review, maturity checks, and reconciliation.",
      preferredDeviceClass: "laptop_desktop",
      phoneAllowedWork: [
        "Accept bounded correction proposal deltas.",
        "Accept bounded correction vote deltas.",
        "Maintain local correction views derived from available packets.",
      ],
      phoneAvoidWork: [
        "Avoid bulk correction-history reconciliation by default.",
        "Avoid treating a small local correction window as global truth.",
        "Avoid heavy contested correction scans unless future policy explicitly allows it.",
      ],
      laptopDesktopPreferredWork: [
        "Audit correction histories.",
        "Review contested corrections.",
        "Reconcile correction maturity across larger packet windows.",
      ],
      mustNeverDo: [
        "Treat weak or single-vote correction state as final authority in the architecture.",
        "Treat advisory correction controller state as packet truth.",
        "Repeatedly sync unchanged correction views.",
      ],
      ledgerRule:
        "Correction state must remain derived from valid correction proposal and vote packets.",
      deltaOnlyRule:
        "Correction synchronizer planning should move correction proposal deltas, vote deltas, maturity events, and cursors only.",
      futureNativeBoundary:
        "Correction admission, vote thresholds, maturity scoring, contested review, and reconciliation enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "tombstone",
      linkedWorkloads: [
        "tombstone_reconciliation",
        "packet_acceptance",
        "packet_validation",
      ],
      purpose:
        "Connect tombstone synchronization to bounded phone tombstone awareness and heavier laptop/desktop audits or cleanup review.",
      phoneRole:
        "Accept tombstone deltas needed to avoid resurrecting deleted or expired Mycelium state.",
      laptopDesktopRole:
        "Prefer tombstone audits, cleanup review, maturity checks, and ledger-derived pruning checks.",
      preferredDeviceClass: "laptop_desktop",
      phoneAllowedWork: [
        "Accept bounded tombstone proposal and vote deltas.",
        "Maintain local non-destructive tombstone awareness.",
        "Use bounded tombstone information to avoid local resurrection of inactive state.",
      ],
      phoneAvoidWork: [
        "Avoid full-ledger tombstone scans by default.",
        "Avoid cleanup execution.",
        "Avoid ledger-derived pruning checks unless future policy explicitly allows it.",
      ],
      laptopDesktopPreferredWork: [
        "Audit tombstone histories.",
        "Review cleanup candidates.",
        "Prepare ledger-derived pruning checks for future native enforcement.",
      ],
      mustNeverDo: [
        "Erase ledger truth silently.",
        "Treat tombstone preview state as destructive execution authority.",
        "Drop packet history outside explicit future enforcement boundaries.",
      ],
      ledgerRule:
        "Tombstone state must remain derived from valid tombstone proposal and vote packets.",
      deltaOnlyRule:
        "Tombstone synchronizer planning should move tombstone deltas and non-destructive preview events only.",
      futureNativeBoundary:
        "Tombstone authorization checks, cleanup enforcement, pruning guards, and irreversible execution rules must move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "identity",
      linkedWorkloads: ["identity_sync_review", "packet_acceptance"],
      purpose:
        "Connect identity synchronization to bounded local identity/device state on phones and heavier consistency review on laptops/desktops.",
      phoneRole:
        "Hold bounded local identity and device state needed for offline Mycelium use.",
      laptopDesktopRole:
        "Prefer identity diagnostics, public identity-history consistency review, and packet-backed rotation audit.",
      preferredDeviceClass: "phone",
      phoneAllowedWork: [
        "Keep bounded local identity state.",
        "Review safe identity metadata deltas.",
        "Use local identity state for offline participation.",
      ],
      phoneAvoidWork: [
        "Avoid sharing private device material.",
        "Avoid unbounded device fingerprints.",
        "Avoid assuming remote ownership of local identity.",
      ],
      laptopDesktopPreferredWork: [
        "Run identity diagnostics.",
        "Review identity consistency against packet history.",
        "Audit public identity rotation events.",
      ],
      mustNeverDo: [
        "Require remote identity ownership.",
        "Synchronize private keys or device secrets.",
        "Treat device-local identity settings as universal truth.",
      ],
      ledgerRule:
        "Shared identity state must remain packet-backed or explicitly local when it is not in the ledger.",
      deltaOnlyRule:
        "Identity synchronizer planning should move safe identity metadata deltas and packet-backed identity events only.",
      futureNativeBoundary:
        "Signature verification, identity rotation rules, secure key access, and private-material isolation should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "settings",
      linkedWorkloads: [
        "settings_sync_review",
        "ledger_portability_review",
        "packet_acceptance",
      ],
      purpose:
        "Connect settings synchronization to local phone settings and bounded settings deltas with laptop/desktop conflict and portability review.",
      phoneRole:
        "Hold local settings and accept bounded settings deltas when settings are explicitly shared.",
      laptopDesktopRole:
        "Help review settings conflicts, drift, and portability without forcing local-only preferences.",
      preferredDeviceClass: "phone",
      phoneAllowedWork: [
        "Keep local settings local.",
        "Accept bounded settings deltas when explicitly packet-backed.",
        "Review shared settings changes before local application.",
      ],
      phoneAvoidWork: [
        "Avoid broadcasting unchanged settings.",
        "Avoid overriding platform-local preferences through sync.",
        "Avoid treating local-only debug preferences as shared truth.",
      ],
      laptopDesktopPreferredWork: [
        "Review settings conflicts.",
        "Audit settings history when packet-backed.",
        "Assist portability review for shared settings material.",
      ],
      mustNeverDo: [
        "Repeatedly broadcast unchanged settings.",
        "Force local-only settings onto another device.",
        "Treat credentials or private platform preferences as sync material.",
      ],
      ledgerRule:
        "Shared settings must be packet-backed; local-only settings remain local device state.",
      deltaOnlyRule:
        "Settings synchronizer planning should move explicit settings deltas, cursors, and review events only.",
      futureNativeBoundary:
        "Policy-gated settings admission, secure local setting storage, and capability enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "diagnostics",
      linkedWorkloads: [
        "diagnostics_scan",
        "packet_validation",
        "phrase_indexing",
        "meaning_indexing",
        "correction_reconciliation",
      ],
      purpose:
        "Connect diagnostics synchronization to lightweight phone summaries and heavier laptop/desktop scans, packet audits, index checks, and reconciliation reports.",
      phoneRole:
        "Expose lightweight diagnostics summaries only, bounded to safe local operation.",
      laptopDesktopRole:
        "Prefer full diagnostics scans, packet audits, index checks, and reconciliation reports.",
      preferredDeviceClass: "laptop_desktop",
      phoneAllowedWork: [
        "Expose bounded health summaries.",
        "Report packet gap summaries.",
        "Display local diagnostics needed for safe use.",
      ],
      phoneAvoidWork: [
        "Avoid full diagnostics scans by default.",
        "Avoid heavy packet audits.",
        "Avoid index checks that require sustained background work.",
      ],
      laptopDesktopPreferredWork: [
        "Run full diagnostics scans.",
        "Run packet audits.",
        "Check larger phrase and meaning indexes.",
        "Prepare reconciliation reports.",
      ],
      mustNeverDo: [
        "Force heavy diagnostic scans on phones by default.",
        "Turn diagnostics into packet truth.",
        "Synchronize raw logs with private material.",
      ],
      ledgerRule:
        "Diagnostics may summarize ledger-derived facts but must not replace the packet ledger as truth.",
      deltaOnlyRule:
        "Diagnostics synchronizer planning should move bounded summaries, gap reports, and reproducible diagnostic events only.",
      futureNativeBoundary:
        "Sensitive diagnostic redaction, signed local attestations, integrity proofs, and scan enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      synchronizerName: "ledger_portability",
      linkedWorkloads: [
        "ledger_export",
        "ledger_import",
        "ledger_portability_review",
        "packet_validation",
      ],
      purpose:
        "Connect ledger portability synchronization to bounded phone awareness and full laptop/desktop export, import, verification, and bulk integrity checks.",
      phoneRole:
        "Participate in bounded import/export awareness without taking on full portability scans by default.",
      laptopDesktopRole:
        "Prefer full ledger export/import, portability verification, and bulk packet integrity checks.",
      preferredDeviceClass: "laptop_desktop",
      phoneAllowedWork: [
        "Display bounded import/export awareness.",
        "Review portability summaries.",
        "Accept small portability status deltas.",
      ],
      phoneAvoidWork: [
        "Avoid full ledger export/import by default.",
        "Avoid bulk integrity checks.",
        "Avoid sustained portability scans unless future policy explicitly allows it.",
      ],
      laptopDesktopPreferredWork: [
        "Prepare full ledger exports.",
        "Review full ledger imports.",
        "Verify portability manifests.",
        "Run bulk packet integrity checks.",
      ],
      mustNeverDo: [
        "Implement behavior outside the Mycelium language and meaning layer.",
        "Treat derived caches as ledger portability truth.",
        "Admit invalid packet bundles.",
      ],
      ledgerRule:
        "Portability material must remain valid Mycelium packet-ledger material or reproducible metadata about that material.",
      deltaOnlyRule:
        "Ledger portability synchronizer planning should move export/import manifests, packet bundles, integrity summaries, and review events only.",
      futureNativeBoundary:
        "Ledger export/import validation, manifest verification, schema checks, deterministic replay, and bulk packet integrity enforcement should move behind Rust, WASM, or native Mycelium boundaries.",
      runtimeStatus: "architecture_only",
    },
  ],
} as const satisfies MyceliumSynchronizerWorkloadPolicyMatrix;
