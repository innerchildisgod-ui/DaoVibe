import type { LanguageEngine } from "../engine";
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
  listKnowledgeWithEffectiveMeaningVotes,
  listMeaningConfidencePacketsForPhrase,
  searchPhrases,
  selectBestMeaning,
} from "./PhraseLookup";
import {
  buildBestMeaningExplanation,
  type BestMeaningExplanationResult,
} from "./MeaningExplanation";
import { getPacketTraceForPhrase } from "./PacketTrace";
import { listTombstoneExecutionPreviewForPhrase } from "./TombstoneExecutionPreview";
import {
  listCorrectionTombstonesForPhrase,
  listTombstonePacketsForPhrase,
} from "./TombstoneLookup";

export interface LanguageControllerRuntimeOptions {
  tombstoneExecutionEnabled?: boolean;
}

export type BestMeaningExplanationControllerResult =
  | {
      found: false;
      phrase_id: string;
    }
  | ({
      found: true;
    } & BestMeaningExplanationResult);

export class LanguageController {
  constructor(
    private readonly engine: LanguageEngine,
    private readonly runtimeOptions: LanguageControllerRuntimeOptions = {}
  ) {}

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
    return listKnowledgeWithEffectiveMeaningVotes(this.engine);
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
    return listTombstoneExecutionPreviewForPhrase(this.engine, phraseId, {
      tombstoneExecutionEnabled: this.tombstoneExecutionEnabled(),
    });
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
    const meaningConfidencePackets = listMeaningConfidencePacketsForPhrase(
      this.engine,
      phraseResult.phrase_id
    );
    const tombstoneExecutionEnabled = this.tombstoneExecutionEnabled();
    const tombstonePackets = tombstoneExecutionEnabled
      ? listTombstonePacketsForPhrase(this.engine, phraseResult.phrase_id)
      : [];

    return selectBestMeaning(
      phraseResult.phrase,
      phraseResult.phrase_id,
      correctionPackets,
      meaningConfidencePackets,
      tombstonePackets,
      {
        tombstoneExecutionEnabled,
      }
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

  private tombstoneExecutionEnabled(): boolean {
    return this.runtimeOptions.tombstoneExecutionEnabled === true;
  }
}

