import { createPacket, LmpPacket } from "./protocol/packet";
import { estimatePacketSize, PacketSizeEstimate } from "./protocol/packetSize";
import { SQLiteStore } from "./storage/sqliteStore";

import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "./protocol/packetTypes";
import { PacketIndex } from "./protocol/packetIndex";
import { PacketRouter, PacketRouteResult } from "./protocol/packetRouter";
import { PhraseStore } from "./knowledge/phraseStore";
import { SafetyLabel } from "./safety/safetyLabels";
import { NodeAgeGroup, SafetyGate } from "./safety/safetyGate";
import { NodeDirectory } from "./network/nodeDirectory";
import { NodeProfile } from "./network/nodeProfile";
import { RoutePlan, RoutePlanner } from "./network/routePlanner";

export interface LanguageEngineConfig {
  zone: string;
  author: string;
  nodeAgeGroup: NodeAgeGroup;
  dbPath?: string;
}

export interface EngineActionResult<TPayload> {
  packet: LmpPacket<TPayload>;
  packetSize: PacketSizeEstimate;
  packetRoute: PacketRouteResult;
  nodeRoute: RoutePlan;
}

export type ReceivePacketApplyStatus =
  | "applied_to_knowledge"
  | "stored_event_only"
  | "not_yet_supported"
  | "already_stored";

export interface ReceivePacketResult {
  packet: LmpPacket;
  packetSize: PacketSizeEstimate;
  packetRoute: PacketRouteResult;
  appliedToKnowledge: boolean;
  applyStatus: ReceivePacketApplyStatus;
}

export type SyncImportPacketStatus =
  | "accepted_new"
  | "already_stored"
  | "rejected_invalid"
  | "rejected_expired"
  | "failed_apply";

export interface SyncImportPacketResult {
  packet_index: number;
  packet_id: string;
  packet_type: string;
  status: SyncImportPacketStatus;
  applied_to_knowledge: boolean;
  apply_status?: ReceivePacketApplyStatus;
  route_decision?: string;
  errors: string[];
}

export interface SyncImportSummary {
  accepted_new: number;
  already_stored: number;
  rejected_invalid: number;
  rejected_expired: number;
  failed_apply: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function classifySyncImportFailure(error: unknown): SyncImportPacketStatus {
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (
    message.includes("reject_expired") ||
    lowerMessage.includes("expired")
  ) {
    return "rejected_expired";
  }

  if (
    message.includes("reject_invalid") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("unsupported") ||
    lowerMessage.includes("missing")
  ) {
    return "rejected_invalid";
  }

  return "failed_apply";
}

function summarizeSyncImportResults(
  results: SyncImportPacketResult[]
): SyncImportSummary {
  return results.reduce<SyncImportSummary>(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    {
      accepted_new: 0,
      already_stored: 0,
      rejected_invalid: 0,
      rejected_expired: 0,
      failed_apply: 0,
    }
  );
}

export class LanguageEngine {
  private store = new PhraseStore();
  private packetIndex = new PacketIndex();
  private packetRouter = new PacketRouter(this.packetIndex);
  private safetyGate = new SafetyGate();
  private nodeDirectory = new NodeDirectory();
  private routePlanner = new RoutePlanner(this.nodeDirectory);
  private sqliteStore: SQLiteStore;

  constructor(private readonly config: LanguageEngineConfig) {
    this.sqliteStore = new SQLiteStore(this.config.dbPath);
    this.store.hydrate(this.sqliteStore.listKnowledge());
  }

  addNode(node: NodeProfile): void {
    this.nodeDirectory.addNode(node);
  }

  listNodes(): NodeProfile[] {
    return this.nodeDirectory.listNodes();
  }

  observePhrase(
    payload: PhraseObservedPayload,
    safetyLabel: SafetyLabel = "normal"
  ): EngineActionResult<PhraseObservedPayload> {
    this.safetyGate.assertAllowed(safetyLabel, {
      nodeAgeGroup: this.config.nodeAgeGroup,
      action: "observe_phrase",
    });

    const packet = createPacket({
      packet_type: "phrase_observed",
      zone: this.config.zone,
      author: this.config.author,
      payload,
    });

    const packetSize = estimatePacketSize(packet);

    const packetRoute = this.packetRouter.routeIncoming(packet);
    this.assertPacketAccepted(packetRoute);

    this.store.observePhrase(payload);
    this.sqliteStore.savePacket(packet, packetSize);
    this.sqliteStore.upsertPhrase(payload, safetyLabel);

    const nodeRoute = this.routePlanner.planRoute(packet, safetyLabel);

    return {
      packet,
      packetSize,
      packetRoute,
      nodeRoute,
    };
  }

  proposeMeaning(
    payload: MeaningProposalPayload,
    parent?: string
  ): EngineActionResult<MeaningProposalPayload> {
    const phrase = this.store.getPhrase(payload.phrase_id);

    if (!phrase) {
      throw new Error(`Phrase not found: ${payload.phrase_id}`);
    }

    this.safetyGate.assertAllowed(phrase.safety_label, {
      nodeAgeGroup: this.config.nodeAgeGroup,
      action: "propose_meaning",
    });

    const packet = createPacket({
      packet_type: "meaning_proposal",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    const packetSize = estimatePacketSize(packet);

    const packetRoute = this.packetRouter.routeIncoming(packet);
    this.assertPacketAccepted(packetRoute);

    const meaning = this.store.proposeMeaning(payload);
    this.sqliteStore.savePacket(packet, packetSize);
    this.sqliteStore.upsertMeaning(payload.phrase_id, meaning);

    const nodeRoute = this.routePlanner.planRoute(packet, phrase.safety_label);

    return {
      packet,
      packetSize,
      packetRoute,
      nodeRoute,
    };
  }

  voteMeaning(
    payload: MeaningVotePayload,
    parent?: string
  ): EngineActionResult<MeaningVotePayload> {
    const phrase = this.store.getPhrase(payload.phrase_id);

    if (!phrase) {
      throw new Error(`Phrase not found: ${payload.phrase_id}`);
    }

    this.safetyGate.assertAllowed(phrase.safety_label, {
      nodeAgeGroup: this.config.nodeAgeGroup,
      action: "vote_meaning",
    });

    const packet = createPacket({
      packet_type: "meaning_vote",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    const packetSize = estimatePacketSize(packet);

    const packetRoute = this.packetRouter.routeIncoming(packet);
    this.assertPacketAccepted(packetRoute);

    const meaning = this.store.vote(payload);
    this.sqliteStore.savePacket(packet, packetSize);
    this.sqliteStore.recordVote(packet, payload);
    this.sqliteStore.upsertMeaning(payload.phrase_id, meaning);

    const nodeRoute = this.routePlanner.planRoute(packet, phrase.safety_label);

    return {
      packet,
      packetSize,
      packetRoute,
      nodeRoute,
    };
  }

  applySafetyLabel(
    payload: SafetyLabelPayload,
    parent?: string
  ): EngineActionResult<SafetyLabelPayload> {
    this.safetyGate.assertAllowed(payload.label, {
      nodeAgeGroup: this.config.nodeAgeGroup,
      action: "apply_safety_label",
    });

    const packet = createPacket({
      packet_type: "safety_label",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    const packetSize = estimatePacketSize(packet);

    const packetRoute = this.packetRouter.routeIncoming(packet);
    this.assertPacketAccepted(packetRoute);

    this.store.setSafetyLabel(payload.phrase_id, payload.label);
    this.sqliteStore.savePacket(packet, packetSize);
    this.sqliteStore.setSafetyLabel(payload);

    const nodeRoute = this.routePlanner.planRoute(packet, payload.label);

    return {
      packet,
      packetSize,
      packetRoute,
      nodeRoute,
    };
  }

  listKnowledge() {
    return this.sqliteStore.listKnowledge();
  }

  packetCount(): number {
    return this.sqliteStore.countPackets();
  }

  listPacketSummaries(limit = 100) {
    return this.sqliteStore.listPacketSummaries(limit);
  }

  listPacketsAfter(receivedAfter: number, limit = 100) {
    return this.sqliteStore.listPacketsAfter(receivedAfter, limit);
  }

  getPacketsByIds(packetIds: string[]) {
    return this.sqliteStore.getPacketsByIds(packetIds);
  }

  findMissingPacketIds(packetIds: string[]): string[] {
    return packetIds.filter((packetId) => !this.sqliteStore.hasPacket(packetId));
  }

  pullSyncBatch(cursor = "0:", limit = 100) {
    return this.sqliteStore.listPacketSyncBatch(cursor, limit);
  }

  getPeerSyncCursor(peerAuthor: string) {
    return this.sqliteStore.getPeerSyncCursor(peerAuthor);
  }

  setPeerSyncCursor(peerAuthor: string, cursor: string) {
    return this.sqliteStore.setPeerSyncCursor(peerAuthor, cursor);
  }

  importSyncBatch(params: {
    peerAuthor: string;
    cursorBefore: string;
    cursorAfter: string;
    packets: LmpPacket[];
  }) {
    const currentCursor = this.sqliteStore.getPeerSyncCursor(params.peerAuthor);

    if (currentCursor.cursor !== params.cursorBefore) {
      throw new Error(
        `Sync cursor mismatch for ${params.peerAuthor}. Expected ${currentCursor.cursor}, received ${params.cursorBefore}`
      );
    }

    const results: SyncImportPacketResult[] = [];

    for (let index = 0; index < params.packets.length; index += 1) {
      const packet = params.packets[index];

      try {
        const receiveResult = this.receivePacket(packet);
        const status: SyncImportPacketStatus =
          receiveResult.applyStatus === "already_stored"
            ? "already_stored"
            : "accepted_new";

        results.push({
          packet_index: index,
          packet_id: packet.packet_id,
          packet_type: packet.packet_type,
          status,
          applied_to_knowledge: receiveResult.appliedToKnowledge,
          apply_status: receiveResult.applyStatus,
          route_decision: receiveResult.packetRoute.decision,
          errors: receiveResult.packetRoute.errors,
        });
      } catch (error) {
        const status = classifySyncImportFailure(error);
        const errorMessage = getErrorMessage(error);

        results.push({
          packet_index: index,
          packet_id: packet.packet_id,
          packet_type: packet.packet_type,
          status,
          applied_to_knowledge: false,
          errors: [errorMessage],
        });

        const summary = summarizeSyncImportResults(results);

        throw new Error(
          [
            `Sync import failed for ${params.peerAuthor}.`,
            `Packet index: ${index}.`,
            `Packet ID: ${packet.packet_id}.`,
            `Status: ${status}.`,
            `Cursor was not advanced.`,
            `Summary: ${JSON.stringify(summary)}.`,
            `Reason: ${errorMessage}`,
          ].join(" ")
        );
      }
    }

    const summary = summarizeSyncImportResults(results);

    const cursor = this.sqliteStore.setPeerSyncCursor(
      params.peerAuthor,
      params.cursorAfter
    );

    return {
      peer_author: params.peerAuthor,
      cursor_before: params.cursorBefore,
      cursor_after: cursor.cursor,
      packet_count: params.packets.length,
      imported_count: summary.accepted_new + summary.already_stored,
      accepted_new_count: summary.accepted_new,
      already_stored_count: summary.already_stored,
      failed_count:
        summary.rejected_invalid +
        summary.rejected_expired +
        summary.failed_apply,
      summary,
      results,
    };
  }

  receivePacket(packet: LmpPacket): ReceivePacketResult {
    const packetSize = estimatePacketSize(packet);

    const packetRoute = this.packetRouter.routeIncoming(packet);

    if (packetRoute.decision === "reject_duplicate") {
      if (this.sqliteStore.hasPacket(packet.packet_id)) {
        return {
          packet,
          packetSize,
          packetRoute,
          appliedToKnowledge: false,
          applyStatus: "already_stored",
        };
      }

      this.assertPacketAccepted(packetRoute);
    }

    this.assertPacketAccepted(packetRoute);

    if (this.sqliteStore.hasPacket(packet.packet_id)) {
      return {
        packet,
        packetSize,
        packetRoute,
        appliedToKnowledge: false,
        applyStatus: "already_stored",
      };
    }

    let appliedToKnowledge = false;
    let applyStatus: ReceivePacketApplyStatus;

    switch (packet.packet_type) {
      case "phrase_observed": {
        const payload = packet.payload as PhraseObservedPayload;

        this.store.observePhrase(payload);
        this.sqliteStore.upsertPhrase(payload, "normal");

        appliedToKnowledge = true;
        applyStatus = "applied_to_knowledge";
        break;
      }

      case "meaning_proposal": {
        const payload = packet.payload as MeaningProposalPayload;

        const meaning = this.store.proposeMeaning(payload);
        this.sqliteStore.upsertMeaning(payload.phrase_id, meaning);

        appliedToKnowledge = true;
        applyStatus = "applied_to_knowledge";
        break;
      }

      case "meaning_vote": {
        const payload = packet.payload as MeaningVotePayload;

        const meaning = this.store.vote(payload);
        this.sqliteStore.recordVote(packet, payload);
        this.sqliteStore.upsertMeaning(payload.phrase_id, meaning);

        appliedToKnowledge = true;
        applyStatus = "applied_to_knowledge";
        break;
      }

      case "safety_label": {
        const payload = packet.payload as SafetyLabelPayload;

        this.store.setSafetyLabel(payload.phrase_id, payload.label);
        this.sqliteStore.setSafetyLabel(payload);

        appliedToKnowledge = true;
        applyStatus = "applied_to_knowledge";
        break;
      }

      case "correction":
      case "symbol_sample": {
        applyStatus = "stored_event_only";
        break;
      }

      default: {
        applyStatus = "not_yet_supported";
        break;
      }
    }

    this.sqliteStore.savePacket(packet, packetSize);
    this.refreshResidentStateFromSQLite();

    return {
      packet,
      packetSize,
      packetRoute,
      appliedToKnowledge,
      applyStatus,
    };
  }

  findPacketsByPhrase(phrase_id: string) {
    return this.packetIndex.findByPhrase(phrase_id);
  }

  private refreshResidentStateFromSQLite(): void {
    this.store.hydrate(this.sqliteStore.listKnowledge());
  }

  private assertPacketAccepted(route: PacketRouteResult): void {
    if (route.decision !== "accept_new") {
      throw new Error(
        `Packet was not accepted: ${route.decision}. ${route.errors.join(", ")}`
      );
    }
  }
}
