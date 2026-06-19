export type CorrectionStatus =
  | "pending"
  | "maturing"
  | "confirmed"
  | "rejected"
  | "contested";

export const MIN_CORRECTION_MATURITY_SCORE = 3;

export function determineCorrectionStatus(
  confirmVotes: number,
  rejectVotes: number
): CorrectionStatus {
  const correctionScore = confirmVotes - rejectVotes;

  if (confirmVotes === 0 && rejectVotes === 0) {
    return "pending";
  }

  if (correctionScore >= MIN_CORRECTION_MATURITY_SCORE) {
    return "confirmed";
  }

  if (correctionScore <= -MIN_CORRECTION_MATURITY_SCORE) {
    return "rejected";
  }

  if (confirmVotes > 0 && rejectVotes > 0 && correctionScore === 0) {
    return "contested";
  }

  return "maturing";
}
