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

const DEFAULT_CONFIDENCE = 0;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MIN_VOTES_FOR_FULL_WEIGHT = 3;
const VOTE_WEIGHT = 0.5;

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

  return Math.floor(numericValue);
}

function clampScore(value: number): number {
  return Math.max(-1, Math.min(value, 1));
}
