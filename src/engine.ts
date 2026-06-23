import { createPacket, LmpPacket } from "./protocol/packet";
import { estimatePacketSize, PacketSizeEstimate } from "./protocol/packetSize";
import { SQLiteStore } from "./storage/sqliteStore";

import {
  KycAiAssessmentCompletedPayload,
  KycClaimCreatedPayload,
  KycEvidenceExpiredPayload,
  PaymentIntentCreatedPayload,
  KycEvidencePreparedPayload,
  KycKnownVerifierInvitedPayload,
  KycKnownVerifierVotePayload,
  KycQuorumResultPayload,
  MeaningCorrectionProposedPayload,
  MeaningCorrectionTombstoneProposedPayload,
  MeaningCorrectionTombstoneVotePayload,
  MeaningCorrectionVotePayload,
  MeaningProposalPayload,
  MeaningVotePayload,
  PacketType,
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
import { SyncController } from "./sync/SyncController";
import type { DetailedSyncImportResult } from "./sync/SyncResultSummary";

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

export interface LedgerImportResult {
  accepted_new_count: number;
  already_stored_count: number;
  rejected_invalid_count: number;
  rejected_expired_count: number;
  failed_count: number;
}

type AtomicSyncImportOperation<T> = () => T;

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

  proposeMeaningCorrection(
    payload: MeaningCorrectionProposedPayload,
    parent?: string
  ): EngineActionResult<MeaningCorrectionProposedPayload> {
    const packet = createPacket({
      packet_type: "meaning_correction_proposed",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  voteMeaningCorrection(
    payload: MeaningCorrectionVotePayload,
    parent?: string
  ): EngineActionResult<MeaningCorrectionVotePayload> {
    const packet = createPacket({
      packet_type: "meaning_correction_vote",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  proposeMeaningCorrectionTombstone(
    payload: MeaningCorrectionTombstoneProposedPayload,
    parent?: string
  ): EngineActionResult<MeaningCorrectionTombstoneProposedPayload> {
    const packet = createPacket({
      packet_type: "meaning_correction_tombstone_proposed",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  voteMeaningCorrectionTombstone(
    payload: MeaningCorrectionTombstoneVotePayload,
    parent?: string
  ): EngineActionResult<MeaningCorrectionTombstoneVotePayload> {
    const packet = createPacket({
      packet_type: "meaning_correction_tombstone_vote",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  createKycClaim(
    payload: KycClaimCreatedPayload,
    parent?: string
  ): EngineActionResult<KycClaimCreatedPayload> {
    const packet = createPacket({
      packet_type: "kyc_claim_created",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  prepareKycEvidence(
    payload: KycEvidencePreparedPayload,
    parent?: string
  ): EngineActionResult<KycEvidencePreparedPayload> {
    const packet = createPacket({
      packet_type: "kyc_evidence_prepared",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  completeKycAiAssessment(
    payload: KycAiAssessmentCompletedPayload,
    parent?: string
  ): EngineActionResult<KycAiAssessmentCompletedPayload> {
    const packet = createPacket({
      packet_type: "kyc_ai_assessment_completed",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  inviteKycKnownVerifier(
    payload: KycKnownVerifierInvitedPayload,
    parent?: string
  ): EngineActionResult<KycKnownVerifierInvitedPayload> {
    const packet = createPacket({
      packet_type: "kyc_known_verifier_invited",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  voteKycKnownVerifier(
    payload: KycKnownVerifierVotePayload,
    parent?: string
  ): EngineActionResult<KycKnownVerifierVotePayload> {
    const packet = createPacket({
      packet_type: "kyc_known_verifier_vote",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  recordKycQuorumResult(
    payload: KycQuorumResultPayload,
    parent?: string
  ): EngineActionResult<KycQuorumResultPayload> {
    const packet = createPacket({
      packet_type: "kyc_quorum_result",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  expireKycEvidence(
    payload: KycEvidenceExpiredPayload,
    parent?: string
  ): EngineActionResult<KycEvidenceExpiredPayload> {
    const packet = createPacket({
      packet_type: "kyc_evidence_expired",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  createPaymentIntent(
    payload: PaymentIntentCreatedPayload,
    parent?: string
  ): EngineActionResult<PaymentIntentCreatedPayload> {
    const packet = createPacket({
      packet_type: "payment_intent_created",
      zone: this.config.zone,
      author: this.config.author,
      parent,
      payload,
    });

    return this.storeEventOnlyPacket(packet);
  }

  listKnowledge() {
    return this.sqliteStore.listKnowledge();
  }

  findPhraseById(phraseId: string) {
    return this.sqliteStore.findPhraseById(phraseId);
  }

  searchPhrases(query: string, limit?: number) {
    return this.sqliteStore.searchPhrases(query, limit);
  }

  packetCount(): number {
    return this.sqliteStore.countPackets();
  }

  exportLedgerPackets(): LmpPacket[] {
    return this.sqliteStore.listAllLedgerPackets();
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

  importLedgerPackets(packets: unknown[]): LedgerImportResult {
    const result: LedgerImportResult = {
      accepted_new_count: 0,
      already_stored_count: 0,
      rejected_invalid_count: 0,
      rejected_expired_count: 0,
      failed_count: 0,
    };

    for (const packet of packets) {
      try {
        const receiveResult = this.receivePacket(packet as LmpPacket);

        if (
          receiveResult.applyStatus === "already_stored" ||
          receiveResult.packetRoute.decision === "reject_duplicate"
        ) {
          result.already_stored_count += 1;
        } else {
          result.accepted_new_count += 1;
        }
      } catch (error) {
        result[this.classifyLedgerImportFailure(error, packet)] += 1;
      }
    }

    return result;
  }

  listPacketsByPhraseAndTypes(phraseId: string, packetTypes: PacketType[]) {
    return this.sqliteStore.listPacketsByPhraseAndTypes(phraseId, packetTypes);
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

  withAtomicSyncImport<T>(operation: AtomicSyncImportOperation<T>): T {
    const packetIndexSnapshot = this.packetIndex.snapshot();

    try {
      return this.sqliteStore.runInTransaction(operation);
    } catch (error) {
      this.packetIndex.restore(packetIndexSnapshot);
      this.store = new PhraseStore();
      this.refreshResidentStateFromSQLite();
      throw error;
    }
  }

  importSyncBatch(params: {
    peerAuthor: string;
    cursorBefore: string;
    cursorAfter: string;
    packets: LmpPacket[];
  }): DetailedSyncImportResult {
    return new SyncController(this).importBatch(params);
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

      case "kyc_claim_created":
      case "kyc_evidence_prepared":
      case "kyc_ai_assessment_completed":
      case "kyc_known_verifier_invited":
      case "kyc_known_verifier_vote":
      case "kyc_quorum_result":
      case "kyc_evidence_expired":
      case "correction":
      case "meaning_correction_proposed":
      case "meaning_correction_vote":
      case "meaning_correction_tombstone_proposed":
      case "meaning_correction_tombstone_vote":
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

  private classifyLedgerImportFailure(
    error: unknown,
    packet: unknown
  ): keyof LedgerImportResult {
    const message = error instanceof Error ? error.message : "Unknown error";
    const lowerMessage = message.toLowerCase();

    if (
      message.includes("reject_expired") ||
      lowerMessage.includes("expired")
    ) {
      return "rejected_expired_count";
    }

    if (
      packet === null ||
      typeof packet !== "object" ||
      Array.isArray(packet) ||
      message.includes("reject_invalid") ||
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("unsupported") ||
      lowerMessage.includes("missing")
    ) {
      return "rejected_invalid_count";
    }

    return "failed_count";
  }

  private storeEventOnlyPacket<TPayload>(
    packet: LmpPacket<TPayload>
  ): EngineActionResult<TPayload> {
    const packetSize = estimatePacketSize(packet);
    const packetRoute = this.packetRouter.routeIncoming(packet);

    this.assertPacketAccepted(packetRoute);
    this.sqliteStore.savePacket(packet, packetSize);

    const nodeRoute = this.routePlanner.planRoute(packet, "normal");

    return {
      packet,
      packetSize,
      packetRoute,
      nodeRoute,
    };
  }
}
