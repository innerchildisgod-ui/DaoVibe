import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type {
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
  | "getPacketCount"
  | "listPeerSyncCursors"
>;

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

  getNodeStatus(): MyceliumNodeStatus {
    const identity = this.getLocalNodeIdentity();

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
