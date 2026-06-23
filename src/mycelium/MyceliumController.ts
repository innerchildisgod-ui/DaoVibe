import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type {
  LocalNodeSettings,
  LocalNodeSettingsUpdate,
  LocalNodeIdentity,
  PeerSyncCursor,
  SQLiteStore,
} from "../storage/sqliteStore";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_APP_CONTRACT_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "./MyceliumVersions";
import { KycController } from "./KycController";
import { LanguageController } from "./LanguageController";

type LocalNodeIdentityUpdate = {
  display_name?: string;
  default_author?: string;
};

type LocalNodeStore = Pick<
  SQLiteStore,
  | "getOrCreateLocalNodeIdentity"
  | "updateLocalNodeIdentity"
  | "getOrCreateLocalNodeSettings"
  | "updateLocalNodeSettings"
  | "getPacketCount"
  | "listAppliedSchemaMigrations"
  | "listPeerSyncCursors"
>;

export interface MyceliumRuntimeOptions {
  tombstoneExecutionEnabled?: boolean;
}

export interface MyceliumNodeStatus {
  ok: true;
  node: {
    node_id: string;
    display_name: string;
    default_author: string;
  };
  service: {
    name: "Mycelium";
    layer: "DAOVibe Mycelium";
    status: "ready";
    uptime_seconds: number;
    server_time: number;
  };
  ledger: {
    packet_count: number;
  };
  storage: {
    durable: true;
    engine: "sqlite";
  };
  settings: {
    sync_mode: "manual";
    developer_mode: boolean;
    show_debug_panels: boolean;
  };
  versions: {
    api_version: typeof MYCELIUM_API_VERSION;
    protocol_version: typeof MYCELIUM_PROTOCOL_VERSION;
    app_contract_version: typeof MYCELIUM_APP_CONTRACT_VERSION;
  };
  capabilities: {
    phrase_lookup: true;
    meaning_proposals: true;
    meaning_votes: true;
    corrections: true;
    correction_maturity: true;
    tombstone_packets: true;
    tombstone_execution: false;
    sync: true;
  };
}

export interface MyceliumSyncStatus {
  ok: true;
  sync: {
    enabled: true;
    mode: "manual";
    known_peer_count: number;
    peers: PeerSyncCursor[];
  };
}

export interface MyceliumNodeDiagnostics {
  ok: true;
  diagnostics: {
    server_reachable: true;
    server_time: number;
    uptime_seconds: number;
    versions: MyceliumNodeStatus["versions"];
    node: MyceliumNodeStatus["node"];
    settings: {
      sync_mode: "manual";
      developer_mode: boolean;
      show_debug_panels: boolean;
      default_language_hint: string;
      default_safety_label: string;
    };
    ledger: {
      packet_count: number;
      migration_count: number;
    };
    sync: {
      enabled: true;
      mode: "manual";
      known_peer_count: number;
    };
    safety: {
      tombstone_execution: false;
      deletion_enabled: false;
      ledger_pruning_enabled: false;
    };
  };
}

export class MyceliumController {
  private readonly startedAtMs = Date.now();
  private readonly languageController: LanguageController;
  private readonly kycController: KycController;

  constructor(
    private readonly engine: LanguageEngine,
    private readonly runtimeOptions: MyceliumRuntimeOptions = {}
  ) {
    this.languageController = new LanguageController(engine, runtimeOptions);
    this.kycController = new KycController(engine);
  }

  getLocalNodeIdentity(): LocalNodeIdentity {
    return this.localNodeIdentityStore().getOrCreateLocalNodeIdentity();
  }

  updateLocalNodeIdentity(
    input: LocalNodeIdentityUpdate
  ): LocalNodeIdentity {
    return this.localNodeIdentityStore().updateLocalNodeIdentity(input);
  }

  getLocalNodeSettings(): LocalNodeSettings {
    return this.localNodeStore().getOrCreateLocalNodeSettings();
  }

  updateLocalNodeSettings(
    input: LocalNodeSettingsUpdate
  ): LocalNodeSettings {
    return this.localNodeStore().updateLocalNodeSettings(input);
  }

  getOrCreateLocalKycVerifierAlias(
    ...args: Parameters<KycController["getOrCreateLocalKycVerifierAlias"]>
  ) {
    return this.kycController.getOrCreateLocalKycVerifierAlias(...args);
  }

  getLocalKycVerifierAliasByNodeId(
    ...args: Parameters<KycController["getLocalKycVerifierAliasByNodeId"]>
  ) {
    return this.kycController.getLocalKycVerifierAliasByNodeId(...args);
  }

  listLocalKycVerifierAliases() {
    return this.kycController.listLocalKycVerifierAliases();
  }

  getNodeStatus(): MyceliumNodeStatus {
    const identity = this.getLocalNodeIdentity();
    const settings = this.getLocalNodeSettings();

    return {
      ok: true,
      node: {
        node_id: identity.node_id,
        display_name: identity.display_name,
        default_author: identity.default_author,
      },
      service: {
        name: "Mycelium",
        layer: "DAOVibe Mycelium",
        status: "ready",
        uptime_seconds: Math.max(
          0,
          Math.floor((Date.now() - this.startedAtMs) / 1000)
        ),
        server_time: Math.floor(Date.now() / 1000),
      },
      ledger: {
        packet_count: this.localNodeStore().getPacketCount(),
      },
      storage: {
        durable: true,
        engine: "sqlite",
      },
      settings: {
        sync_mode: settings.sync_mode,
        developer_mode: settings.developer_mode,
        show_debug_panels: settings.show_debug_panels,
      },
      versions: {
        api_version: MYCELIUM_API_VERSION,
        protocol_version: MYCELIUM_PROTOCOL_VERSION,
        app_contract_version: MYCELIUM_APP_CONTRACT_VERSION,
      },
      capabilities: {
        phrase_lookup: true,
        meaning_proposals: true,
        meaning_votes: true,
        corrections: true,
        correction_maturity: true,
        tombstone_packets: true,
        tombstone_execution: false,
        sync: true,
      },
    };
  }

  getSyncStatus(): MyceliumSyncStatus {
    const peers = this.localNodeStore().listPeerSyncCursors();

    return {
      ok: true,
      sync: {
        enabled: true,
        mode: "manual",
        known_peer_count: peers.length,
        peers,
      },
    };
  }

  getNodeDiagnostics(): MyceliumNodeDiagnostics {
    const status = this.getNodeStatus();
    const settings = this.getLocalNodeSettings();
    const syncStatus = this.getSyncStatus();

    return {
      ok: true,
      diagnostics: {
        server_reachable: true,
        server_time: status.service.server_time,
        uptime_seconds: status.service.uptime_seconds,
        versions: status.versions,
        node: status.node,
        settings: {
          sync_mode: settings.sync_mode,
          developer_mode: settings.developer_mode,
          show_debug_panels: settings.show_debug_panels,
          default_language_hint: settings.default_language_hint,
          default_safety_label: settings.default_safety_label,
        },
        ledger: {
          packet_count: status.ledger.packet_count,
          migration_count: this.localNodeStore().listAppliedSchemaMigrations()
            .length,
        },
        sync: {
          enabled: syncStatus.sync.enabled,
          mode: syncStatus.sync.mode,
          known_peer_count: syncStatus.sync.known_peer_count,
        },
        safety: {
          tombstone_execution: false,
          deletion_enabled: false,
          ledger_pruning_enabled: false,
        },
      },
    };
  }

  observePhrase(...args: Parameters<LanguageController["observePhrase"]>) {
    return this.languageController.observePhrase(...args);
  }

  proposeMeaning(...args: Parameters<LanguageController["proposeMeaning"]>) {
    return this.languageController.proposeMeaning(...args);
  }

  voteMeaning(...args: Parameters<LanguageController["voteMeaning"]>) {
    return this.languageController.voteMeaning(...args);
  }

  applySafetyLabel(
    ...args: Parameters<LanguageController["applySafetyLabel"]>
  ) {
    return this.languageController.applySafetyLabel(...args);
  }

  proposeMeaningCorrection(
    ...args: Parameters<LanguageController["proposeMeaningCorrection"]>
  ) {
    return this.languageController.proposeMeaningCorrection(...args);
  }

  voteMeaningCorrection(
    ...args: Parameters<LanguageController["voteMeaningCorrection"]>
  ) {
    return this.languageController.voteMeaningCorrection(...args);
  }

  proposeMeaningCorrectionTombstone(
    ...args: Parameters<LanguageController["proposeMeaningCorrectionTombstone"]>
  ) {
    return this.languageController.proposeMeaningCorrectionTombstone(...args);
  }

  voteMeaningCorrectionTombstone(
    ...args: Parameters<LanguageController["voteMeaningCorrectionTombstone"]>
  ) {
    return this.languageController.voteMeaningCorrectionTombstone(...args);
  }

  listKnowledge() {
    return this.languageController.listKnowledge();
  }

  lookupPhrase(query: string) {
    return this.languageController.lookupPhrase(query);
  }

  searchPhrases(query: string, limit?: number) {
    return this.languageController.searchPhrases(query, limit);
  }

  getPhraseById(phraseId: string) {
    return this.languageController.getPhraseById(phraseId);
  }

  getPhraseCorrections(phraseId: string) {
    return this.languageController.getPhraseCorrections(phraseId);
  }

  getPhraseCorrectionHistory(phraseId: string, limit?: number) {
    return this.languageController.getPhraseCorrectionHistory(phraseId, limit);
  }

  getPhraseCorrectionCleanupCandidates(phraseId: string) {
    return this.languageController.getPhraseCorrectionCleanupCandidates(
      phraseId
    );
  }

  getCorrectionTombstonesForPhrase(phraseId: string) {
    return this.languageController.getCorrectionTombstonesForPhrase(phraseId);
  }

  getTombstoneExecutionPreviewForPhrase(phraseId: string) {
    return this.languageController.getTombstoneExecutionPreviewForPhrase(
      phraseId
    );
  }

  getPhrasePacketTrace(phraseId: string) {
    return this.languageController.getPhrasePacketTrace(phraseId);
  }

  getBestMeaning(phraseId: string) {
    return this.languageController.getBestMeaning(phraseId);
  }

  getBestMeaningExplanation(phraseId: string) {
    return this.languageController.getBestMeaningExplanation(phraseId);
  }

  getKycClaimSummary(kycClaimId: string) {
    return this.kycController.getKycClaimSummary(kycClaimId);
  }

  getPaymentStatusSummary(paymentIntentId: string) {
    return this.engine.getPaymentStatusSummary(paymentIntentId);
  }

  getOrderFulfillmentStatusSummary(orderReferenceId: string) {
    return this.engine.getOrderFulfillmentStatusSummary(orderReferenceId);
  }

  listNodes() {
    return this.engine.listNodes();
  }

  packetCount() {
    return this.engine.packetCount();
  }

  listPacketSummaries(limit = 100) {
    return this.engine.listPacketSummaries(limit);
  }

  listPacketsAfter(receivedAfter: number, limit = 100) {
    return this.engine.listPacketsAfter(receivedAfter, limit);
  }

  receivePacket(packet: LmpPacket) {
    return this.engine.receivePacket(packet);
  }

  private localNodeIdentityStore(): LocalNodeStore {
    return this.localNodeStore();
  }

  private localNodeStore(): LocalNodeStore {
    return (this.engine as unknown as { sqliteStore: LocalNodeStore })
      .sqliteStore;
  }
}

