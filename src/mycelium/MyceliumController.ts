import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import { CommerceController } from "./CommerceController";
import { KycController } from "./KycController";
import { LanguageController } from "./LanguageController";
import {
  NodeRuntimeController,
  type LocalNodeIdentityUpdate,
} from "./NodeRuntimeController";
import type {
  LocalNodeSettingsUpdate,
} from "../storage/sqliteStore";

export type {
  MyceliumNodeDiagnostics,
  MyceliumNodeStatus,
  MyceliumSyncStatus,
} from "./NodeRuntimeController";

export interface MyceliumRuntimeOptions {
  tombstoneExecutionEnabled?: boolean;
}

export class MyceliumController {
  private readonly nodeRuntimeController: NodeRuntimeController;
  private readonly languageController: LanguageController;
  private readonly kycController: KycController;
  private readonly commerceController: CommerceController;

  constructor(
    private readonly engine: LanguageEngine,
    private readonly runtimeOptions: MyceliumRuntimeOptions = {}
  ) {
    this.nodeRuntimeController = new NodeRuntimeController(engine);
    this.languageController = new LanguageController(engine, runtimeOptions);
    this.kycController = new KycController(engine);
    this.commerceController = new CommerceController(engine);
  }

  getLocalNodeIdentity() {
    return this.nodeRuntimeController.getLocalNodeIdentity();
  }

  updateLocalNodeIdentity(input: LocalNodeIdentityUpdate) {
    return this.nodeRuntimeController.updateLocalNodeIdentity(input);
  }

  getLocalNodeSettings() {
    return this.nodeRuntimeController.getLocalNodeSettings();
  }

  updateLocalNodeSettings(input: LocalNodeSettingsUpdate) {
    return this.nodeRuntimeController.updateLocalNodeSettings(input);
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

  getNodeStatus() {
    return this.nodeRuntimeController.getNodeStatus();
  }

  getSyncStatus() {
    return this.nodeRuntimeController.getSyncStatus();
  }

  getNodeDiagnostics() {
    return this.nodeRuntimeController.getNodeDiagnostics();
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
    return this.commerceController.getPaymentStatusSummary(paymentIntentId);
  }

  getOrderFulfillmentStatusSummary(orderReferenceId: string) {
    return this.commerceController.getOrderFulfillmentStatusSummary(
      orderReferenceId
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
}
