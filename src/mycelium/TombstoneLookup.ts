import type { LmpPacket } from "../protocol/packet";
import type {
  CorrectionTombstoneReason,
  MeaningCorrectionTombstoneProposedPayload,
  MeaningCorrectionTombstoneVotePayload,
  PacketType,
} from "../protocol/packetTypes";
import type { PhraseLookupSource } from "./PhraseLookup";
import {
  determineTombstoneStatus,
  type TombstoneStatus,
} from "./TombstoneStatus";

export interface CorrectionTombstoneSummary {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  reason: CorrectionTombstoneReason;
  details?: string;
  proposer?: string;
  proposal_packet_id: string;
  proposed_at: number;
  confirm_votes: number;
  reject_votes: number;
  tombstone_score: number;
  status: TombstoneStatus;
}

export interface PhraseCorrectionTombstonesResult {
  phrase_id: string;
  tombstones: CorrectionTombstoneSummary[];
}

interface TombstoneProposalCandidate {
  payload: MeaningCorrectionTombstoneProposedPayload;
  packet_id: string;
  created_at: number;
}

const TOMBSTONE_PACKET_TYPES: PacketType[] = [
  "meaning_correction_tombstone_proposed",
  "meaning_correction_tombstone_vote",
];

const TOMBSTONE_REASONS = new Set<string>([
  "rejected_status",
  "negative_score",
  "losing_conflict_candidate",
  "spam",
  "malformed",
  "other",
]);

export function listTombstonePacketsForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): LmpPacket[] {
  return (
    source.listPacketsForPhraseByTypes?.(phraseId, TOMBSTONE_PACKET_TYPES) ??
    source.listPacketsByPhraseAndTypes?.(phraseId, TOMBSTONE_PACKET_TYPES) ?? []
  );
}

export function listCorrectionTombstonesForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): PhraseCorrectionTombstonesResult {
  const normalizedPhraseId = phraseId.trim();
  const tombstonePackets = listTombstonePacketsForPhrase(
    source,
    normalizedPhraseId
  );

  return {
    phrase_id: normalizedPhraseId,
    tombstones: summarizeTombstonePacketsForPhrase(
      normalizedPhraseId,
      tombstonePackets
    ),
  };
}

export function summarizeTombstonePacketsForPhrase(
  phraseId: string,
  tombstonePackets: LmpPacket[]
): CorrectionTombstoneSummary[] {
  const proposals = new Map<string, TombstoneProposalCandidate>();
  const voteCounts = new Map<
    string,
    { confirm_votes: number; reject_votes: number }
  >();
  const countedVoterVotes = new Set<string>();

  for (const packet of tombstonePackets) {
    if (packet.packet_type === "meaning_correction_tombstone_proposed") {
      const payload =
        packet.payload as MeaningCorrectionTombstoneProposedPayload;
      const groupKey = tombstoneGroupKey(payload);

      if (
        groupKey &&
        isTombstoneProposalForPhrase(payload, phraseId) &&
        !proposals.has(groupKey)
      ) {
        proposals.set(groupKey, {
          payload,
          packet_id: packet.packet_id,
          created_at:
            typeof packet.created_at === "number" ? packet.created_at : 0,
        });
      }
    }

    if (packet.packet_type === "meaning_correction_tombstone_vote") {
      const payload = packet.payload as MeaningCorrectionTombstoneVotePayload;

      if (isTombstoneVoteForPhrase(payload, phraseId)) {
        const groupKey = tombstoneGroupKey(payload);

        if (!groupKey) {
          continue;
        }

        const voterKey = tombstoneVoteVoterKey(payload);

        if (voterKey) {
          if (countedVoterVotes.has(voterKey)) {
            continue;
          }

          countedVoterVotes.add(voterKey);
        }

        const counts = voteCounts.get(groupKey) ?? {
          confirm_votes: 0,
          reject_votes: 0,
        };

        if (payload.vote === "confirm") {
          counts.confirm_votes += 1;
        }

        if (payload.vote === "reject") {
          counts.reject_votes += 1;
        }

        voteCounts.set(groupKey, counts);
      }
    }
  }

  return [...proposals.entries()]
    .map(([groupKey, proposal]) => {
      const counts = voteCounts.get(groupKey) ?? {
        confirm_votes: 0,
        reject_votes: 0,
      };

      return toTombstoneSummary(proposal, counts);
    })
    .sort(compareTombstoneSummaries);
}

function isTombstoneProposalForPhrase(
  payload: MeaningCorrectionTombstoneProposedPayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.correction_id) &&
    isNonEmptyString(payload.tombstone_id) &&
    TOMBSTONE_REASONS.has(payload.reason) &&
    (payload.details === undefined || isNonEmptyString(payload.details)) &&
    (payload.proposer === undefined || isNonEmptyString(payload.proposer))
  );
}

function isTombstoneVoteForPhrase(
  payload: MeaningCorrectionTombstoneVotePayload,
  phraseId: string
): boolean {
  return (
    payload.phrase_id === phraseId &&
    isNonEmptyString(payload.correction_id) &&
    isNonEmptyString(payload.tombstone_id) &&
    (payload.vote === "confirm" || payload.vote === "reject") &&
    (payload.voter === undefined || typeof payload.voter === "string")
  );
}

function tombstoneGroupKey(
  payload:
    | MeaningCorrectionTombstoneProposedPayload
    | MeaningCorrectionTombstoneVotePayload
): string | undefined {
  if (
    !isNonEmptyString(payload.phrase_id) ||
    !isNonEmptyString(payload.correction_id) ||
    !isNonEmptyString(payload.tombstone_id)
  ) {
    return undefined;
  }

  return JSON.stringify([
    payload.phrase_id,
    payload.correction_id,
    payload.tombstone_id,
  ]);
}

function tombstoneVoteVoterKey(
  payload: MeaningCorrectionTombstoneVotePayload
): string | undefined {
  if (!isNonEmptyString(payload.voter)) {
    return undefined;
  }

  return JSON.stringify([
    payload.phrase_id,
    payload.correction_id,
    payload.tombstone_id,
    payload.voter.trim(),
  ]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toTombstoneSummary(
  proposal: TombstoneProposalCandidate,
  scores: {
    confirm_votes: number;
    reject_votes: number;
  }
): CorrectionTombstoneSummary {
  const payload = proposal.payload;
  const tombstoneScore = scores.confirm_votes - scores.reject_votes;
  const summary: CorrectionTombstoneSummary = {
    phrase_id: payload.phrase_id,
    correction_id: payload.correction_id,
    tombstone_id: payload.tombstone_id,
    reason: payload.reason,
    proposal_packet_id: proposal.packet_id,
    proposed_at: proposal.created_at,
    confirm_votes: scores.confirm_votes,
    reject_votes: scores.reject_votes,
    tombstone_score: tombstoneScore,
    status: determineTombstoneStatus(
      scores.confirm_votes,
      scores.reject_votes
    ),
  };

  if (typeof payload.details === "string") {
    summary.details = payload.details;
  }

  if (typeof payload.proposer === "string") {
    summary.proposer = payload.proposer;
  }

  return summary;
}

function compareTombstoneSummaries(
  left: CorrectionTombstoneSummary,
  right: CorrectionTombstoneSummary
): number {
  if (right.tombstone_score !== left.tombstone_score) {
    return right.tombstone_score - left.tombstone_score;
  }

  if (right.confirm_votes !== left.confirm_votes) {
    return right.confirm_votes - left.confirm_votes;
  }

  if (left.reject_votes !== right.reject_votes) {
    return left.reject_votes - right.reject_votes;
  }

  if (left.proposed_at !== right.proposed_at) {
    return left.proposed_at - right.proposed_at;
  }

  return left.tombstone_id.localeCompare(right.tombstone_id);
}
