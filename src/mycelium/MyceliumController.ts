import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type {
  LocalNodeSettings,
  LocalNodeSettingsUpdate,
  LocalNodeIdentity,
  PeerSyncCursor,
  SQLiteStore,
} from "../storage/sqliteStore";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionTombstoneProposedPayload,
  MeaningCorrectionTombstoneVotePayload,
  MeaningCorrectionVotePayload,
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "../protocol/packetTypes";
import type { SafetyLabel } from "../safety/safetyLabels";
import {
  findPhraseById,
  listCorrectionCleanupCandidatesForPhrase,
  listCorrectionHistoryForPhrase,
  listCorrectionsForPhrase,
  listCorrectionPacketsForPhrase,
  searchPhrases,
  selectBestMeaning,
} from "./PhraseLookup";
import {
  buildBestMeaningExplanation,
  type BestMeaningExplanationResult,
} from "./MeaningExplanation";
import { getPacketTraceForPhrase } from "./PacketTrace";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_APP_CONTRACT_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "./MyceliumVersions";
import { listTombstoneExecutionPreviewForPhrase } from "./TombstoneExecutionPreview";
import { listCorrectionTombstonesForPhrase } from "./TombstoneLookup";

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

type BestMeaningExplanationControllerResult =
  | {
      found: false;
      phrase_id: string;
    }
  | ({
      found: true;
    } & BestMeaningExplanationResult);

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

  constructor(private readonly engine: LanguageEngine) {}

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

  observePhrase(
    payload: PhraseObservedPayload,
    safetyLabel?: SafetyLabel
  ) {
    return this.engine.observePhrase(payload, safetyLabel);
  }

  proposeMeaning(payload: MeaningProposalPayload, parent?: string) {
    return this.engine.proposeMeaning(payload, parent);
  }

  voteMeaning(payload: MeaningVotePayload, parent?: string) {
    return this.engine.voteMeaning(payload, parent);
  }

  applySafetyLabel(payload: SafetyLabelPayload, parent?: string) {
    return this.engine.applySafetyLabel(payload, parent);
  }

  proposeMeaningCorrection(
    payload: MeaningCorrectionProposedPayload,
    parent?: string
  ) {
    return this.engine.proposeMeaningCorrection(payload, parent);
  }

  voteMeaningCorrection(payload: MeaningCorrectionVotePayload, parent?: string) {
    return this.engine.voteMeaningCorrection(payload, parent);
  }

  proposeMeaningCorrectionTombstone(
    payload: MeaningCorrectionTombstoneProposedPayload,
    parent?: string
  ) {
    return this.engine.proposeMeaningCorrectionTombstone(payload, parent);
  }

  voteMeaningCorrectionTombstone(
    payload: MeaningCorrectionTombstoneVotePayload,
    parent?: string
  ) {
    return this.engine.voteMeaningCorrectionTombstone(payload, parent);
  }

  listKnowledge() {
    return this.engine.listKnowledge();
  }

  lookupPhrase(query: string) {
    const normalizedQuery = query.toLowerCase();

    return this.listKnowledge()
      .filter(
        (phrase) =>
          phrase.surface_text?.toLowerCase().includes(normalizedQuery) ||
          phrase.phonetic_hint?.toLowerCase().includes(normalizedQuery) ||
          phrase.language_hint?.toLowerCase().includes(normalizedQuery)
      )
      .map((phrase) => ({
        phrase_id: phrase.phrase_id,
        surface_text: phrase.surface_text,
        phonetic_hint: phrase.phonetic_hint,
        language_hint: phrase.language_hint,
        safety_label: phrase.safety_label,
        meanings: phrase.meanings.map((meaning) => ({
          meaning_id: meaning.meaning_id,
          reference_meaning: meaning.reference_meaning,
          context: meaning.context,
          confidence: meaning.confidence,
          confirms: meaning.confirms,
          rejects: meaning.rejects,
        })),
      }));
  }

  searchPhrases(query: string, limit?: number) {
    return searchPhrases(this.engine, query, limit);
  }

  getPhraseById(phraseId: string) {
    return findPhraseById(this.engine, phraseId);
  }

  getPhraseCorrections(phraseId: string) {
    return listCorrectionsForPhrase(this.engine, phraseId);
  }

  getPhraseCorrectionHistory(phraseId: string, limit?: number) {
    return listCorrectionHistoryForPhrase(this.engine, phraseId, limit);
  }

  getPhraseCorrectionCleanupCandidates(phraseId: string) {
    return listCorrectionCleanupCandidatesForPhrase(this.engine, phraseId);
  }

  getCorrectionTombstonesForPhrase(phraseId: string) {
    return listCorrectionTombstonesForPhrase(this.engine, phraseId);
  }

  getTombstoneExecutionPreviewForPhrase(phraseId: string) {
    return listTombstoneExecutionPreviewForPhrase(this.engine, phraseId);
  }

  getPhrasePacketTrace(phraseId: string) {
    return getPacketTraceForPhrase(this.engine, phraseId);
  }

  getBestMeaning(phraseId: string) {
    const phraseResult = this.getPhraseById(phraseId);
    const correctionPackets = listCorrectionPacketsForPhrase(
      this.engine,
      phraseResult.phrase_id
    );

    return selectBestMeaning(
      phraseResult.phrase,
      phraseResult.phrase_id,
      correctionPackets
    );
  }

  getBestMeaningExplanation(
    phraseId: string
  ): BestMeaningExplanationControllerResult {
    const phraseResult = this.getPhraseById(phraseId);

    if (!phraseResult.found) {
      return {
        found: false,
        phrase_id: phraseResult.phrase_id,
      };
    }

    const bestMeaningResult = this.getBestMeaning(phraseResult.phrase_id);
    const correctionsResult = this.getPhraseCorrections(phraseResult.phrase_id);
    const tombstonesResult = this.getCorrectionTombstonesForPhrase(
      phraseResult.phrase_id
    );

    return {
      found: true,
      ...buildBestMeaningExplanation({
        phraseId: phraseResult.phrase_id,
        phrase: phraseResult.phrase,
        bestMeaningResult,
        corrections: correctionsResult.corrections,
        tombstones: tombstonesResult.tombstones,
      }),
    };
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
