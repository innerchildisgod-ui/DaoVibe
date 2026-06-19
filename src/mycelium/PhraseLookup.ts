import type {
  KnowledgeMeaningRecord,
  KnowledgePhraseRecord,
} from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import { calculateMeaningScore } from "./LanguageConfidence";

export interface PhraseLookupSource {
  listKnowledge(): KnowledgePhraseRecord[];
  findPhraseById?(phraseId: string): KnowledgePhraseRecord | undefined;
  searchPhrases?(
    query: string,
    limit?: number
  ): KnowledgePhraseRecord[];
  listPacketsByPhraseAndTypes?(
    phraseId: string,
    packetTypes: PacketType[]
  ): LmpPacket[];
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

export interface CorrectionSummary {
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  confirm_votes: number;
  reject_votes: number;
  correction_score: number;
}

export interface PhraseCorrectionsResult {
  phrase_id: string;
  corrections: CorrectionSummary[];
}

interface CorrectionBestMeaningDetails extends BestMeaningDetails {
  source: "correction";
  correction_id: string;
  original_meaning_id: string;
  confirm_votes: number;
  reject_votes: number;
  correction_score: number;
}

const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;
const CORRECTION_PACKET_TYPES: PacketType[] = [
  "meaning_correction_proposed",
  "meaning_correction_vote",
];

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
    phrase,
  };
}

export function selectBestMeaning(
  phrase: KnowledgePhraseRecord | undefined,
  phraseId: string,
  correctionPackets: LmpPacket[] = []
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

  const bestMeaning = phrase.meanings
    .map(toScoredMeaning)
    .sort((left, right) => right.score - left.score)[0];
  const corrections = summarizeCorrectionPacketsForPhrase(
    phrase.phrase_id,
    correctionPackets
  );
  const bestCorrection = selectBestCorrectionMeaning(
    phrase,
    bestMeaning.score,
    corrections
  );

  return {
    phrase_id: phrase.phrase_id,
    has_best_meaning: true,
    best_meaning: bestCorrection ?? bestMeaning,
  };
}

export function listCorrectionPacketsForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): LmpPacket[] {
  return (
    source.listPacketsByPhraseAndTypes?.(phraseId, CORRECTION_PACKET_TYPES) ?? []
  );
}

export function listCorrectionsForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): PhraseCorrectionsResult {
  const normalizedPhraseId = phraseId.trim();
  const correctionPackets = listCorrectionPacketsForPhrase(
    source,
    normalizedPhraseId
  );

  return {
    phrase_id: normalizedPhraseId,
    corrections: summarizeCorrectionPacketsForPhrase(
      normalizedPhraseId,
      correctionPackets
    ),
  };
}

export function summarizeCorrectionPacketsForPhrase(
  phraseId: string,
  correctionPackets: LmpPacket[]
): CorrectionSummary[] {
  const proposals = new Map<string, MeaningCorrectionProposedPayload>();
  const voteCounts = new Map<
    string,
    { confirm_votes: number; reject_votes: number }
  >();

  for (const packet of correctionPackets) {
    if (packet.packet_type === "meaning_correction_proposed") {
      const payload = packet.payload as MeaningCorrectionProposedPayload;

      if (
        isCorrectionProposalForPhrase(payload, phraseId) &&
        !proposals.has(payload.correction_id)
      ) {
        proposals.set(payload.correction_id, payload);
      }
    }

    if (packet.packet_type === "meaning_correction_vote") {
      const payload = packet.payload as MeaningCorrectionVotePayload;

      if (isCorrectionVoteForPhrase(payload, phraseId)) {
        const counts = voteCounts.get(payload.correction_id) ?? {
          confirm_votes: 0,
          reject_votes: 0,
        };

        if (payload.vote === "confirm") {
          counts.confirm_votes += 1;
        }

        if (payload.vote === "reject") {
          counts.reject_votes += 1;
        }

        voteCounts.set(payload.correction_id, counts);
      }
    }
  }

  return [...proposals.values()]
    .map((proposal) => {
      const counts = voteCounts.get(proposal.correction_id) ?? {
        confirm_votes: 0,
        reject_votes: 0,
      };

      return toCorrectionSummary(proposal, counts);
    })
    .sort((left, right) => {
      if (right.correction_score !== left.correction_score) {
        return right.correction_score - left.correction_score;
      }

      return left.correction_id.localeCompare(right.correction_id);
    });
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

function toScoredMeaning(
  meaning: KnowledgeMeaningRecord
): BestMeaningDetails {
  const score = calculateMeaningScore(meaning);

  return {
    meaning_id: meaning.meaning_id,
    reference_meaning: meaning.reference_meaning,
    context: meaning.context,
    confidence: score.confidence,
    confirms: score.confirms,
    rejects: score.rejects,
    score: score.score,
    total_votes: score.total_votes,
  };
}

function selectBestCorrectionMeaning(
  phrase: KnowledgePhraseRecord,
  currentBestScore: number,
  corrections: CorrectionSummary[]
): CorrectionBestMeaningDetails | undefined {
  const knownMeaningIds = new Set(
    phrase.meanings.map((meaning) => meaning.meaning_id)
  );

  return corrections
    .filter((correction) => correction.correction_score > currentBestScore)
    .filter((correction) => knownMeaningIds.has(correction.original_meaning_id))
    .map(toCorrectionBestMeaning)[0];
}

function isCorrectionProposalForPhrase(
  payload: MeaningCorrectionProposedPayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.original_meaning_id) &&
    isNonEmptyString(payload.correction_id) &&
    isNonEmptyString(payload.corrected_reference_meaning)
  );
}

function isCorrectionVoteForPhrase(
  payload: MeaningCorrectionVotePayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.correction_id) &&
    (payload.vote === "confirm" || payload.vote === "reject")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toCorrectionSummary(
  proposal: MeaningCorrectionProposedPayload,
  scores: {
    confirm_votes: number;
    reject_votes: number;
  }
): CorrectionSummary {
  const correction: CorrectionSummary = {
    phrase_id: proposal.phrase_id,
    original_meaning_id: proposal.original_meaning_id,
    correction_id: proposal.correction_id,
    corrected_reference_meaning: proposal.corrected_reference_meaning,
    confirm_votes: scores.confirm_votes,
    reject_votes: scores.reject_votes,
    correction_score: scores.confirm_votes - scores.reject_votes,
  };

  if (typeof proposal.correction_context === "string") {
    correction.correction_context = proposal.correction_context;
  }

  if (typeof proposal.source === "string") {
    correction.source = proposal.source;
  }

  return correction;
}

function toCorrectionBestMeaning(
  correction: CorrectionSummary
): CorrectionBestMeaningDetails {
  const totalVotes = correction.confirm_votes + correction.reject_votes;

  return {
    meaning_id: correction.original_meaning_id,
    reference_meaning: correction.corrected_reference_meaning,
    context: correction.correction_context,
    confidence: correction.correction_score,
    confirms: correction.confirm_votes,
    rejects: correction.reject_votes,
    score: correction.correction_score,
    total_votes: totalVotes,
    source: "correction",
    correction_id: correction.correction_id,
    original_meaning_id: correction.original_meaning_id,
    confirm_votes: correction.confirm_votes,
    reject_votes: correction.reject_votes,
    correction_score: correction.correction_score,
  };
}
