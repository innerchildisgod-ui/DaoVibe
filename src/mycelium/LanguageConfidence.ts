export interface MeaningScoreInput {
  confidence?: number;
  confirms?: number;
  rejects?: number;
}

export interface MeaningScoreResult {
  score: number;
  confidence: number;
  confirms: number;
  rejects: number;
  total_votes: number;
}

export type CountedVoteValue = "confirm" | "reject";

export interface UniqueVoterVoteInput {
  target_key: string;
  voter_id?: string;
  vote: CountedVoteValue;
  created_at?: number;
  packet_id?: string;
}

export interface UniqueVoterVoteCounts {
  confirm_votes: number;
  reject_votes: number;
}

interface EffectiveUniqueVoterVote {
  target_key: string;
  voter_id: string;
  vote: CountedVoteValue;
  created_at: number;
  packet_id: string;
}

const DEFAULT_CONFIDENCE = 0;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MIN_VOTES_FOR_FULL_WEIGHT = 3;
const VOTE_WEIGHT = 0.5;
const IDENTIFIED_VOTE_WEIGHT = 1;
const ANONYMOUS_VOTE_WEIGHT = 0.5;

export function calculateMeaningScore(
  input: MeaningScoreInput
): MeaningScoreResult {
  const confidence = clampConfidence(input.confidence);
  const confirms = normalizeVoteCount(input.confirms);
  const rejects = normalizeVoteCount(input.rejects);
  const totalVotes = confirms + rejects;

  const voteBalance =
    totalVotes > 0 ? (confirms - rejects) / totalVotes : 0;
  const voteMaturity = Math.min(totalVotes / MIN_VOTES_FOR_FULL_WEIGHT, 1);
  const voteSignal = voteBalance * voteMaturity * VOTE_WEIGHT;

  const score = clampScore(confidence + voteSignal);

  return {
    score,
    confidence,
    confirms,
    rejects,
    total_votes: totalVotes,
  };
}

export function countUniqueVoterVotes(
  votes: UniqueVoterVoteInput[]
): Map<string, UniqueVoterVoteCounts> {
  const countsByTarget = new Map<string, UniqueVoterVoteCounts>();
  const latestVoteByTargetVoter = new Map<string, EffectiveUniqueVoterVote>();

  for (const vote of votes) {
    const targetKey = normalizeNonEmptyString(vote.target_key);

    if (!targetKey) {
      continue;
    }

    const voterId = normalizeNonEmptyString(vote.voter_id);

    if (!voterId) {
      addVoteCount(
        countsByTarget,
        targetKey,
        vote.vote,
        ANONYMOUS_VOTE_WEIGHT
      );
      continue;
    }

    const effectiveVote: EffectiveUniqueVoterVote = {
      target_key: targetKey,
      voter_id: voterId,
      vote: vote.vote,
      created_at: normalizePacketCreatedAt(vote.created_at),
      packet_id: normalizePacketId(vote.packet_id),
    };
    const voteKey = JSON.stringify([targetKey, voterId]);
    const existingVote = latestVoteByTargetVoter.get(voteKey);

    if (
      !existingVote ||
      compareEffectiveVotes(effectiveVote, existingVote) > 0
    ) {
      latestVoteByTargetVoter.set(voteKey, effectiveVote);
    }
  }

  for (const vote of latestVoteByTargetVoter.values()) {
    addVoteCount(countsByTarget, vote.target_key, vote.vote);
  }

  return countsByTarget;
}

function clampConfidence(value: unknown): number {
  const numericValue = Number(value ?? DEFAULT_CONFIDENCE);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CONFIDENCE;
  }

  return Math.max(MIN_CONFIDENCE, Math.min(numericValue, MAX_CONFIDENCE));
}

function normalizeVoteCount(value: unknown): number {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  if (numericValue < 1) {
    return numericValue;
  }

  return Math.floor(numericValue);
}

function clampScore(value: number): number {
  return Math.max(-1, Math.min(value, 1));
}

function addVoteCount(
  countsByTarget: Map<string, UniqueVoterVoteCounts>,
  targetKey: string,
  vote: CountedVoteValue,
  weight = IDENTIFIED_VOTE_WEIGHT
): void {
  const counts = countsByTarget.get(targetKey) ?? {
    confirm_votes: 0,
    reject_votes: 0,
  };

  if (vote === "confirm") {
    counts.confirm_votes += weight;
  }

  if (vote === "reject") {
    counts.reject_votes += weight;
  }

  countsByTarget.set(targetKey, counts);
}

function compareEffectiveVotes(
  left: EffectiveUniqueVoterVote,
  right: EffectiveUniqueVoterVote
): number {
  if (left.created_at !== right.created_at) {
    return left.created_at - right.created_at;
  }

  return left.packet_id.localeCompare(right.packet_id);
}

function normalizePacketCreatedAt(value: unknown): number {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.floor(numericValue);
}

function normalizePacketId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}
