import type { KnowledgePhraseRecord } from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import type { BestMeaningDetails, PhraseLookupSource } from "./PhraseLookup";
import {
  applyConflictMetadata,
  compareRankedCorrections,
  correctionConflictGroupId,
} from "./CorrectionConflict";
import {
  selectCorrectionCleanupCandidates as selectCorrectionCleanupCandidatesFor,
} from "./CorrectionCleanup";
import type {
  CorrectionCleanupCandidate as CorrectionCleanupCandidateFor,
} from "./CorrectionCleanup";
import {
  clampCorrectionHistoryLimit,
  summarizeCorrectionHistoryEventsForPhrase,
} from "./CorrectionHistory";
import type {
  CorrectionHistoryEvent,
  PhraseCorrectionHistoryResult,
} from "./CorrectionHistory";
import { determineCorrectionStatus } from "./CorrectionStatus";
import type { CorrectionStatus } from "./CorrectionStatus";

export type { CorrectionStatus } from "./CorrectionStatus";
export type { CorrectionCleanupReason } from "./CorrectionCleanup";
export type {
  CorrectionHistoryEvent,
  CorrectionProposedHistoryEvent,
  CorrectionVoteHistoryEvent,
  PhraseCorrectionHistoryResult,
} from "./CorrectionHistory";
export { clampCorrectionHistoryLimit } from "./CorrectionHistory";

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

export type CorrectionCleanupCandidate =
  CorrectionCleanupCandidateFor<CorrectionSummary>;

export interface PhraseCorrectionCleanupCandidatesResult {
  phrase_id: string;
  candidates: CorrectionCleanupCandidate[];
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

const CORRECTION_PACKET_TYPES: PacketType[] = [
  "meaning_correction_proposed",
  "meaning_correction_vote",
];

export function listCorrectionPacketsForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): LmpPacket[] {
  return (
    source.listPacketsForPhraseByTypes?.(phraseId, CORRECTION_PACKET_TYPES) ??
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

export function listCorrectionHistoryForPhrase(
  source: PhraseLookupSource,
  phraseId: string,
  limit?: number
): PhraseCorrectionHistoryResult {
  const normalizedPhraseId = phraseId.trim();
  const normalizedLimit = clampCorrectionHistoryLimit(limit);
  const correctionPackets = listCorrectionPacketsForPhrase(
    source,
    normalizedPhraseId
  );

  return {
    phrase_id: normalizedPhraseId,
    limit: normalizedLimit,
    history: summarizeCorrectionHistoryForPhrase(
      normalizedPhraseId,
      correctionPackets,
      normalizedLimit
    ),
  };
}

export function listCorrectionCleanupCandidatesForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): PhraseCorrectionCleanupCandidatesResult {
  const correctionsResult = listCorrectionsForPhrase(source, phraseId);

  return {
    phrase_id: correctionsResult.phrase_id,
    candidates: selectCorrectionCleanupCandidates(
      correctionsResult.corrections
    ),
  };
}

export function selectCorrectionCleanupCandidates(
  corrections: CorrectionSummary[]
): CorrectionCleanupCandidate[] {
  return selectCorrectionCleanupCandidatesFor(corrections);
}

export function summarizeCorrectionHistoryForPhrase(
  phraseId: string,
  correctionPackets: LmpPacket[],
  limit?: number
): CorrectionHistoryEvent[] {
  return summarizeCorrectionHistoryEventsForPhrase(
    phraseId,
    correctionPackets,
    limit,
    {
      isCorrectionProposalForPhrase,
      isCorrectionVoteForPhrase,
      isNonEmptyString,
    }
  );
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
export function selectBestCorrectionMeaning(
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
