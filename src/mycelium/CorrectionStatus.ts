export type CorrectionStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "contested";

export function determineCorrectionStatus(
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
