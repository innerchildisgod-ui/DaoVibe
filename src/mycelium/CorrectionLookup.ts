import type { KnowledgePhraseRecord } from "../storage/sqliteStore";
import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import type { BestMeaningDetails, PhraseLookupSource } from "./PhraseLookup";

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

export type CorrectionHistoryEvent =
  | CorrectionProposedHistoryEvent
  | CorrectionVoteHistoryEvent;

export interface CorrectionProposedHistoryEvent {
  event_type: "correction_proposed";
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  packet_id?: string;
  created_at?: string | number;
}

export interface CorrectionVoteHistoryEvent {
  event_type: "correction_vote";
  phrase_id: string;
  correction_id: string;
  vote: "confirm" | "reject";
  voter?: string;
  packet_id?: string;
  created_at?: string | number;
}

export interface PhraseCorrectionHistoryResult {
  phrase_id: string;
  limit: number;
  history: CorrectionHistoryEvent[];
}

export type CorrectionCleanupReason =
  | "rejected_status"
  | "negative_score"
  | "losing_conflict_candidate";

export interface CorrectionCleanupCandidate extends CorrectionSummary {
  cleanup_reasons: CorrectionCleanupReason[];
}

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

interface CorrectionHistoryCandidate {
  event: CorrectionHistoryEvent;
  ledger_index: number;
  timestamp_order?: number;
}

interface CorrectionHistoryMetadata {
  packet_id?: string;
  created_at?: string | number;
}

const DEFAULT_CORRECTION_HISTORY_LIMIT = 100;
const MAX_CORRECTION_HISTORY_LIMIT = 500;
const CORRECTION_PACKET_TYPES: PacketType[] = [
  "meaning_correction_proposed",
  "meaning_correction_vote",
];
export function clampCorrectionHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CORRECTION_HISTORY_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(Number(limit)),
      MAX_CORRECTION_HISTORY_LIMIT
    )
  );
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
  return corrections
    .map(toCorrectionCleanupCandidate)
    .filter(
      (candidate): candidate is CorrectionCleanupCandidate =>
        candidate !== undefined
    )
    .sort(compareCorrectionCleanupCandidates);
}

export function summarizeCorrectionHistoryForPhrase(
  phraseId: string,
  correctionPackets: LmpPacket[],
  limit = DEFAULT_CORRECTION_HISTORY_LIMIT
): CorrectionHistoryEvent[] {
  const normalizedLimit = clampCorrectionHistoryLimit(limit);

  return correctionPackets
    .map((packet, index) => toCorrectionHistoryCandidate(packet, phraseId, index))
    .filter(
      (candidate): candidate is CorrectionHistoryCandidate =>
        candidate !== undefined
    )
    .sort(compareCorrectionHistoryCandidates)
    .slice(0, normalizedLimit)
    .map((candidate) => candidate.event);
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

function toCorrectionCleanupCandidate(
  correction: CorrectionSummary
): CorrectionCleanupCandidate | undefined {
  const cleanupReasons = correctionCleanupReasons(correction);

  if (cleanupReasons.length === 0) {
    return undefined;
  }

  return {
    ...correction,
    cleanup_reasons: cleanupReasons,
  };
}

function correctionCleanupReasons(
  correction: CorrectionSummary
): CorrectionCleanupReason[] {
  const reasons: CorrectionCleanupReason[] = [];

  if (correction.status === "rejected") {
    reasons.push("rejected_status");
  }

  if (correction.correction_score < 0) {
    reasons.push("negative_score");
  }

  if (
    correction.is_conflicting &&
    correction.conflict_rank > 1 &&
    correction.correction_score <= 0
  ) {
    reasons.push("losing_conflict_candidate");
  }

  return reasons;
}

function compareCorrectionCleanupCandidates(
  left: CorrectionCleanupCandidate,
  right: CorrectionCleanupCandidate
): number {
  if (left.correction_score !== right.correction_score) {
    return left.correction_score - right.correction_score;
  }

  if (right.reject_votes !== left.reject_votes) {
    return right.reject_votes - left.reject_votes;
  }

  return left.correction_id.localeCompare(right.correction_id);
}

function toCorrectionHistoryCandidate(
  packet: LmpPacket,
  phraseId: string,
  ledgerIndex: number
): CorrectionHistoryCandidate | undefined {
  const event = toCorrectionHistoryEvent(packet, phraseId);

  if (!event) {
    return undefined;
  }

  return {
    event,
    ledger_index: ledgerIndex,
    timestamp_order: packetTimestampOrder(packet),
  };
}

function toCorrectionHistoryEvent(
  packet: LmpPacket,
  phraseId: string
): CorrectionHistoryEvent | undefined {
  const metadata = packetHistoryMetadata(packet);

  if (packet.packet_type === "meaning_correction_proposed") {
    const payload = packet.payload as MeaningCorrectionProposedPayload;

    if (!isCorrectionProposalForPhrase(payload, phraseId)) {
      return undefined;
    }

    const event: CorrectionProposedHistoryEvent = {
      event_type: "correction_proposed",
      phrase_id: payload.phrase_id,
      original_meaning_id: payload.original_meaning_id,
      correction_id: payload.correction_id,
      corrected_reference_meaning: payload.corrected_reference_meaning,
      ...metadata,
    };

    if (typeof payload.correction_context === "string") {
      event.correction_context = payload.correction_context;
    }

    if (typeof payload.source === "string") {
      event.source = payload.source;
    }

    return event;
  }

  if (packet.packet_type === "meaning_correction_vote") {
    const payload = packet.payload as MeaningCorrectionVotePayload;

    if (!isCorrectionVoteForPhrase(payload, phraseId)) {
      return undefined;
    }

    const event: CorrectionVoteHistoryEvent = {
      event_type: "correction_vote",
      phrase_id: payload.phrase_id,
      correction_id: payload.correction_id,
      vote: payload.vote,
      ...metadata,
    };

    if (isNonEmptyString(payload.voter)) {
      event.voter = payload.voter.trim();
    }

    return event;
  }

  return undefined;
}

function packetHistoryMetadata(packet: LmpPacket): CorrectionHistoryMetadata {
  const metadata: CorrectionHistoryMetadata = {};

  if (typeof packet.packet_id === "string" && packet.packet_id) {
    metadata.packet_id = packet.packet_id;
  }

  const createdAt = packetCreatedAt(packet);

  if (createdAt !== undefined) {
    metadata.created_at = createdAt;
  }

  return metadata;
}

function packetCreatedAt(packet: LmpPacket): string | number | undefined {
  const createdAt = (packet as { created_at?: unknown }).created_at;

  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt;
  }

  if (typeof createdAt === "string" && createdAt.trim()) {
    return createdAt;
  }

  return undefined;
}

function packetTimestampOrder(packet: LmpPacket): number | undefined {
  const createdAt = packetCreatedAt(packet);

  if (typeof createdAt === "number") {
    return createdAt;
  }

  if (typeof createdAt === "string") {
    const numericCreatedAt = Number(createdAt);

    if (Number.isFinite(numericCreatedAt)) {
      return numericCreatedAt;
    }

    const parsedCreatedAt = Date.parse(createdAt);

    if (Number.isFinite(parsedCreatedAt)) {
      return parsedCreatedAt;
    }
  }

  return undefined;
}

function compareCorrectionHistoryCandidates(
  left: CorrectionHistoryCandidate,
  right: CorrectionHistoryCandidate
): number {
  if (
    left.timestamp_order !== undefined &&
    right.timestamp_order !== undefined &&
    left.timestamp_order !== right.timestamp_order
  ) {
    return left.timestamp_order - right.timestamp_order;
  }

  if (left.ledger_index !== right.ledger_index) {
    return left.ledger_index - right.ledger_index;
  }

  return compareOptionalStrings(left.event.packet_id, right.event.packet_id);
}

function compareOptionalStrings(
  left: string | undefined,
  right: string | undefined
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left.localeCompare(right);
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
