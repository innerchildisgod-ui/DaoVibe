import type { KnowledgePhraseRecord } from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type { PacketType } from "../protocol/packetTypes";
import {
  applyMeaningVoteEvidence,
  listMeaningConfidencePacketsForPhrase,
  listKnowledgeWithEffectiveMeaningVotes,
  summarizeMeaningVoteEvidenceForPhrase,
  toScoredMeaning,
  type MeaningConfidenceLookupSource,
} from "./MeaningConfidenceLookup";
import {
  rankCorrectionSummaries,
  selectBestCorrectionMeaning,
  summarizeCorrectionPacketsForPhrase,
} from "./CorrectionLookup";
import { selectActiveCorrectionsForTombstoneExecution } from "./TombstoneExecutionPreview";
import { summarizeTombstonePacketsForPhrase } from "./TombstoneLookup";

export type {
  CorrectionCleanupCandidate,
  CorrectionCleanupReason,
  CorrectionHistoryEvent,
  CorrectionProposedHistoryEvent,
  CorrectionStatus,
  CorrectionSummary,
  CorrectionVoteHistoryEvent,
  PhraseCorrectionCleanupCandidatesResult,
  PhraseCorrectionHistoryResult,
  PhraseCorrectionsResult,
} from "./CorrectionLookup";

export {
  clampCorrectionHistoryLimit,
  listCorrectionCleanupCandidatesForPhrase,
  listCorrectionHistoryForPhrase,
  listCorrectionPacketsForPhrase,
  listCorrectionsForPhrase,
  selectCorrectionCleanupCandidates,
  summarizeCorrectionHistoryForPhrase,
  summarizeCorrectionPacketsForPhrase,
} from "./CorrectionLookup";

export {
  listKnowledgeWithEffectiveMeaningVotes,
  listMeaningConfidencePacketsForPhrase,
} from "./MeaningConfidenceLookup";

export interface PhraseLookupSource extends MeaningConfidenceLookupSource {
  findPhraseById?(phraseId: string): KnowledgePhraseRecord | undefined;
  searchPhrases?(
    query: string,
    limit?: number
  ): KnowledgePhraseRecord[];
}

export interface PhraseSearchResult {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label: string;
  meaning_count: number;
}

export interface PhraseSearchResponse {
  query: string;
  count: number;
  results: PhraseSearchResult[];
}

export interface PhraseByIdResult {
  found: boolean;
  phrase_id: string;
  phrase?: KnowledgePhraseRecord;
}

export interface BestMeaningResult {
  phrase_id: string;
  has_best_meaning: boolean;
  best_meaning: BestMeaningDetails | null;
  reason?: string;
}

export interface BestMeaningDetails {
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  confirms: number;
  rejects: number;
  score: number;
  total_votes: number;
  source?: "correction";
  correction_id?: string;
  original_meaning_id?: string;
  confirm_votes?: number;
  reject_votes?: number;
  correction_score?: number;
}

export interface BestMeaningSelectionOptions {
  tombstoneExecutionEnabled?: boolean;
}

const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;

export function clampPhraseSearchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.max(1, Math.min(Math.floor(Number(limit)), MAX_SEARCH_LIMIT));
}

export function searchPhrases(
  source: PhraseLookupSource,
  query: string,
  limit?: number
): PhraseSearchResponse {
  const normalizedQuery = query.trim();
  const normalizedLimit = clampPhraseSearchLimit(limit);

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      count: 0,
      results: [],
    };
  }

  const phrases = source.searchPhrases
    ? source.searchPhrases(normalizedQuery, normalizedLimit)
    : source.listKnowledge().filter((phrase) =>
        phraseMatchesQuery(phrase, normalizedQuery)
      );

  const results = phrases.slice(0, normalizedLimit).map(toPhraseSearchResult);

  return {
    query: normalizedQuery,
    count: results.length,
    results,
  };
}

export function findPhraseById(
  source: PhraseLookupSource,
  phraseId: string
): PhraseByIdResult {
  const normalizedPhraseId = phraseId.trim();
  const phrase = normalizedPhraseId
    ? source.findPhraseById?.(normalizedPhraseId) ??
      source
        .listKnowledge()
        .find((candidate) => candidate.phrase_id === normalizedPhraseId)
    : undefined;

  return {
    found: phrase !== undefined,
    phrase_id: normalizedPhraseId,
    phrase: phrase ? applyMeaningVoteEvidence(source, phrase) : undefined,
  };
}

export function selectBestMeaning(
  phrase: KnowledgePhraseRecord | undefined,
  phraseId: string,
  correctionPackets: LmpPacket[] = [],
  meaningConfidencePackets: LmpPacket[] = [],
  tombstonePackets: LmpPacket[] = [],
  options: BestMeaningSelectionOptions = {}
): BestMeaningResult {
  const normalizedPhraseId = phraseId.trim();

  if (!phrase) {
    return {
      phrase_id: normalizedPhraseId,
      has_best_meaning: false,
      best_meaning: null,
      reason: "Phrase not found.",
    };
  }

  if (phrase.meanings.length === 0) {
    return {
      phrase_id: phrase.phrase_id,
      has_best_meaning: false,
      best_meaning: null,
      reason: "No meanings have been proposed for this phrase yet.",
    };
  }

  const meaningVoteEvidence = summarizeMeaningVoteEvidenceForPhrase(
    phrase.phrase_id,
    meaningConfidencePackets
  );
  const bestMeaning = phrase.meanings
    .map((meaning) =>
      toScoredMeaning(meaning, meaningVoteEvidence.get(meaning.meaning_id))
    )
    .sort((left, right) => right.score - left.score)[0];
  const corrections = summarizeCorrectionPacketsForPhrase(
    phrase.phrase_id,
    correctionPackets
  );
  const selectableCorrections = options.tombstoneExecutionEnabled
    ? selectActiveCorrectionsForBestMeaning(
        phrase.phrase_id,
        corrections,
        tombstonePackets
      )
    : corrections;
  const bestCorrection = selectBestCorrectionMeaning(
    phrase,
    bestMeaning.score,
    selectableCorrections
  );

  return {
    phrase_id: phrase.phrase_id,
    has_best_meaning: true,
    best_meaning: bestCorrection ?? bestMeaning,
  };
}

function selectActiveCorrectionsForBestMeaning(
  phraseId: string,
  corrections: ReturnType<typeof summarizeCorrectionPacketsForPhrase>,
  tombstonePackets: LmpPacket[]
) {
  const tombstones = summarizeTombstonePacketsForPhrase(
    phraseId,
    tombstonePackets
  );
  const activeCorrections = selectActiveCorrectionsForTombstoneExecution(
    phraseId,
    corrections,
    tombstones
  );

  return rankCorrectionSummaries(activeCorrections);
}

function phraseMatchesQuery(
  phrase: KnowledgePhraseRecord,
  query: string
): boolean {
  const normalizedQuery = query.toLowerCase();

  return [
    phrase.phrase_id,
    phrase.surface_text,
    phrase.phonetic_hint,
    phrase.language_hint,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function toPhraseSearchResult(
  phrase: KnowledgePhraseRecord
): PhraseSearchResult {
  return {
    phrase_id: phrase.phrase_id,
    surface_text: phrase.surface_text,
    phonetic_hint: phrase.phonetic_hint,
    language_hint: phrase.language_hint,
    safety_label: phrase.safety_label,
    meaning_count: phrase.meanings.length,
  };
}