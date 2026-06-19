import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "../protocol/packetTypes";
import type { SafetyLabel } from "../safety/safetyLabels";
import {
  findPhraseById,
  listCorrectionHistoryForPhrase,
  listCorrectionsForPhrase,
  listCorrectionPacketsForPhrase,
  searchPhrases,
  selectBestMeaning,
} from "./PhraseLookup";

export class MyceliumController {
  constructor(private readonly engine: LanguageEngine) {}

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
}
