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

export type CorrectionStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "contested";

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
  status: CorrectionStatus;
  conflict_group_id: string;
  conflict_rank: number;
  is_conflicting: boolean;
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

interface CorrectionProposalCandidate {
  payload: MeaningCorrectionProposedPayload;
  created_at?: number;
}

interface RankedCorrectionSummary extends CorrectionSummary {
  proposal_created_at?: number;
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
  const proposals = new Map<string, CorrectionProposalCandidate>();
  const voteCounts = new Map<
    string,
    { confirm_votes: number; reject_votes: number }
  >();
  const countedVoterVotes = new Set<string>();

  for (const packet of correctionPackets) {
    if (packet.packet_type === "meaning_correction_proposed") {
      const payload = packet.payload as MeaningCorrectionProposedPayload;

      if (
        isCorrectionProposalForPhrase(payload, phraseId) &&
        !proposals.has(payload.correction_id)
      ) {
        proposals.set(payload.correction_id, {
          payload,
          created_at:
            typeof packet.created_at === "number"
              ? packet.created_at
              : undefined,
        });
      }
    }

    if (packet.packet_type === "meaning_correction_vote") {
      const payload = packet.payload as MeaningCorrectionVotePayload;

      if (isCorrectionVoteForPhrase(payload, phraseId)) {
        const voterKey = correctionVoteVoterKey(payload);

        if (voterKey) {
          if (countedVoterVotes.has(voterKey)) {
            continue;
          }

          countedVoterVotes.add(voterKey);
        }

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

  const corrections = [...proposals.values()]
    .map((proposal) => {
      const counts = voteCounts.get(proposal.payload.correction_id) ?? {
        confirm_votes: 0,
        reject_votes: 0,
      };

      return toCorrectionSummary(proposal, counts);
    })
    .sort(compareRankedCorrections);

  return applyConflictMetadata(corrections);
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
    .filter((correction) => correction.conflict_rank === 1)
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
    (payload.vote === "confirm" || payload.vote === "reject") &&
    (payload.voter === undefined || typeof payload.voter === "string")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function correctionVoteVoterKey(
  payload: MeaningCorrectionVotePayload
): string | undefined {
  if (!isNonEmptyString(payload.voter)) {
    return undefined;
  }

  return JSON.stringify([
    payload.phrase_id,
    payload.correction_id,
    payload.voter.trim(),
  ]);
}

function toCorrectionSummary(
  proposal: CorrectionProposalCandidate,
  scores: {
    confirm_votes: number;
    reject_votes: number;
  }
): RankedCorrectionSummary {
  const payload = proposal.payload;
  const conflictGroupId = correctionConflictGroupId(
    payload.phrase_id,
    payload.original_meaning_id
  );
  const correction: RankedCorrectionSummary = {
    phrase_id: payload.phrase_id,
    original_meaning_id: payload.original_meaning_id,
    correction_id: payload.correction_id,
    corrected_reference_meaning: payload.corrected_reference_meaning,
    confirm_votes: scores.confirm_votes,
    reject_votes: scores.reject_votes,
    correction_score: scores.confirm_votes - scores.reject_votes,
    status: determineCorrectionStatus(
      scores.confirm_votes,
      scores.reject_votes
    ),
    conflict_group_id: conflictGroupId,
    conflict_rank: 1,
    is_conflicting: false,
    proposal_created_at: proposal.created_at,
  };

  if (typeof payload.correction_context === "string") {
    correction.correction_context = payload.correction_context;
  }

  if (typeof payload.source === "string") {
    correction.source = payload.source;
  }

  return correction;
}

function correctionConflictGroupId(
  phraseId: string,
  originalMeaningId: string
): string {
  return `${phraseId}::${originalMeaningId}`;
}

function applyConflictMetadata(
  corrections: RankedCorrectionSummary[]
): CorrectionSummary[] {
  const groups = new Map<string, RankedCorrectionSummary[]>();

  for (const correction of corrections) {
    const group = groups.get(correction.conflict_group_id) ?? [];

    group.push(correction);
    groups.set(correction.conflict_group_id, group);
  }

  for (const [groupId, group] of groups) {
    const rankedGroup = [...group].sort(compareRankedCorrections);
    const isConflicting = rankedGroup.length > 1;

    rankedGroup.forEach((correction, index) => {
      correction.conflict_group_id = groupId;
      correction.conflict_rank = index + 1;
      correction.is_conflicting = isConflicting;
    });
  }

  return corrections
    .sort(compareRankedCorrections)
    .map(toPublicCorrectionSummary);
}

function compareRankedCorrections(
  left: RankedCorrectionSummary,
  right: RankedCorrectionSummary
): number {
  if (right.correction_score !== left.correction_score) {
    return right.correction_score - left.correction_score;
  }

  if (right.confirm_votes !== left.confirm_votes) {
    return right.confirm_votes - left.confirm_votes;
  }

  if (left.reject_votes !== right.reject_votes) {
    return left.reject_votes - right.reject_votes;
  }

  if (
    left.proposal_created_at !== undefined &&
    right.proposal_created_at !== undefined &&
    left.proposal_created_at !== right.proposal_created_at
  ) {
    return left.proposal_created_at - right.proposal_created_at;
  }

  if (
    left.proposal_created_at !== undefined &&
    right.proposal_created_at === undefined
  ) {
    return -1;
  }

  if (
    left.proposal_created_at === undefined &&
    right.proposal_created_at !== undefined
  ) {
    return 1;
  }

  return left.correction_id.localeCompare(right.correction_id);
}

function toPublicCorrectionSummary(
  correction: RankedCorrectionSummary
): CorrectionSummary {
  const { proposal_created_at, ...publicCorrection } = correction;

  return publicCorrection;
}

function determineCorrectionStatus(
  confirmVotes: number,
  rejectVotes: number
): CorrectionStatus {
  if (confirmVotes === 0 && rejectVotes === 0) {
    return "pending";
  }

  if (confirmVotes > rejectVotes) {
    return "confirmed";
  }

  if (rejectVotes > confirmVotes) {
    return "rejected";
  }

  return "contested";
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
