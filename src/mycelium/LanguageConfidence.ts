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

export function calculateMeaningScore(
  input: MeaningScoreInput
): MeaningScoreResult {
  const confirms = Number(input.confirms ?? 0);
  const rejects = Number(input.rejects ?? 0);
  const totalVotes = confirms + rejects;
  const voteScore = totalVotes > 0 ? (confirms - rejects) / totalVotes : 0;
  const storedConfidence = Number(input.confidence ?? 0);
  const score =
    totalVotes > 0 ? (storedConfidence + voteScore) / 2 : storedConfidence;

  return {
    score,
    confidence: storedConfidence,
    confirms,
    rejects,
    total_votes: totalVotes,
  };
}
