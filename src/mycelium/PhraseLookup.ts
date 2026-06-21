import type {
  KnowledgeMeaningRecord,
  KnowledgePhraseRecord,
} from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningProposalPayload,
  MeaningVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import {
  calculateMeaningScore,
  countUniqueVoterVotes,
  type UniqueVoterVoteInput,
} from "./LanguageConfidence";
import {
  selectBestCorrectionMeaning,
  summarizeCorrectionPacketsForPhrase,
} from "./CorrectionLookup";
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
  listPacketsForPhraseByTypes?(
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

interface MeaningVoteEvidence {
  confidence?: number;
  confirm_votes: number;
  reject_votes: number;
}

interface MeaningProposalConfidence {
  confidence: number;
  created_at: number;
  packet_id: string;
}

const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;
const MEANING_CONFIDENCE_PACKET_TYPES: PacketType[] = [
  "meaning_proposal",
  "meaning_vote",
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

export function listMeaningConfidencePacketsForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): LmpPacket[] {
  return (
    source.listPacketsForPhraseByTypes?.(
      phraseId,
      MEANING_CONFIDENCE_PACKET_TYPES
    ) ??
    source.listPacketsByPhraseAndTypes?.(
      phraseId,
      MEANING_CONFIDENCE_PACKET_TYPES
    ) ??
    []
  );
}

export function listKnowledgeWithEffectiveMeaningVotes(
  source: PhraseLookupSource
): KnowledgePhraseRecord[] {
  return source
    .listKnowledge()
    .map((phrase) => applyMeaningVoteEvidence(source, phrase));
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
  meaningConfidencePackets: LmpPacket[] = []
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

function applyMeaningVoteEvidence(
  source: PhraseLookupSource,
  phrase: KnowledgePhraseRecord
): KnowledgePhraseRecord {
  const meaningVoteEvidence = summarizeMeaningVoteEvidenceForPhrase(
    phrase.phrase_id,
    listMeaningConfidencePacketsForPhrase(source, phrase.phrase_id)
  );

  if (meaningVoteEvidence.size === 0) {
    return phrase;
  }

  return {
    ...phrase,
    meanings: phrase.meanings.map((meaning) =>
      toMeaningRecordWithEvidence(
        meaning,
        meaningVoteEvidence.get(meaning.meaning_id)
      )
    ),
  };
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
  meaning: KnowledgeMeaningRecord,
  evidence?: MeaningVoteEvidence
): BestMeaningDetails {
  const score = calculateMeaningScore({
    confidence: evidence?.confidence ?? meaning.confidence,
    confirms: evidence ? evidence.confirm_votes : meaning.confirms,
    rejects: evidence ? evidence.reject_votes : meaning.rejects,
  });

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

function toMeaningRecordWithEvidence(
  meaning: KnowledgeMeaningRecord,
  evidence?: MeaningVoteEvidence
): KnowledgeMeaningRecord {
  if (!evidence) {
    return meaning;
  }

  return {
    ...meaning,
    confidence: evidence.confidence ?? meaning.confidence,
    confirms: evidence.confirm_votes,
    rejects: evidence.reject_votes,
  };
}

function summarizeMeaningVoteEvidenceForPhrase(
  phraseId: string,
  packets: LmpPacket[]
): Map<string, MeaningVoteEvidence> {
  const proposalConfidenceByMeaning = new Map<
    string,
    MeaningProposalConfidence
  >();
  const votes: UniqueVoterVoteInput[] = [];

  for (const packet of packets) {
    if (packet.packet_type === "meaning_proposal") {
      const payload = packet.payload as MeaningProposalPayload;

      if (isMeaningProposalForPhrase(payload, phraseId)) {
        const candidate = {
          confidence: payload.confidence,
          created_at:
            typeof packet.created_at === "number" ? packet.created_at : 0,
          packet_id: packet.packet_id,
        };
        const existing = proposalConfidenceByMeaning.get(payload.meaning_id);

        if (
          !existing ||
          compareMeaningProposalConfidence(candidate, existing) < 0
        ) {
          proposalConfidenceByMeaning.set(payload.meaning_id, candidate);
        }
      }
    }

    if (packet.packet_type === "meaning_vote") {
      const payload = packet.payload as MeaningVotePayload;

      if (isMeaningVoteForPhrase(payload, phraseId)) {
        votes.push({
          target_key: payload.meaning_id,
          voter_id: meaningVoteVoterId(packet),
          vote: payload.vote,
          created_at: packet.created_at,
          packet_id: packet.packet_id,
        });
      }
    }
  }

  const voteCounts = countUniqueVoterVotes(votes);
  const meaningIds = new Set([
    ...proposalConfidenceByMeaning.keys(),
    ...voteCounts.keys(),
  ]);
  const evidenceByMeaning = new Map<string, MeaningVoteEvidence>();

  for (const meaningId of meaningIds) {
    const counts = voteCounts.get(meaningId) ?? {
      confirm_votes: 0,
      reject_votes: 0,
    };
    const proposalConfidence = proposalConfidenceByMeaning.get(meaningId);

    evidenceByMeaning.set(meaningId, {
      confidence: proposalConfidence?.confidence,
      confirm_votes: counts.confirm_votes,
      reject_votes: counts.reject_votes,
    });
  }

  return evidenceByMeaning;
}

function isMeaningProposalForPhrase(
  payload: MeaningProposalPayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.meaning_id) &&
    isNonEmptyString(payload.reference_meaning) &&
    typeof payload.confidence === "number" &&
    Number.isFinite(payload.confidence)
  );
}

function isMeaningVoteForPhrase(
  payload: MeaningVotePayload,
  phraseId: string
): payload is MeaningVotePayload & { vote: "confirm" | "reject" } {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.meaning_id) &&
    (payload.vote === "confirm" || payload.vote === "reject")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function meaningVoteVoterId(packet: LmpPacket): string | undefined {
  return isNonEmptyString(packet.author) ? packet.author.trim() : undefined;
}

function compareMeaningProposalConfidence(
  left: MeaningProposalConfidence,
  right: MeaningProposalConfidence
): number {
  if (left.created_at !== right.created_at) {
    return left.created_at - right.created_at;
  }

  return left.packet_id.localeCompare(right.packet_id);
}

