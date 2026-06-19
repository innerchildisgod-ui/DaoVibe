export type TombstoneStatus =
  | "pending"
  | "maturing"
  | "confirmed"
  | "rejected"
  | "contested";

export const MIN_TOMBSTONE_MATURITY_SCORE = 3;

export function determineTombstoneStatus(
  confirmVotes: number,
  rejectVotes: number
): TombstoneStatus {
  const tombstoneScore = confirmVotes - rejectVotes;

  if (confirmVotes === 0 && rejectVotes === 0) {
    return "pending";
  }

  if (tombstoneScore >= MIN_TOMBSTONE_MATURITY_SCORE) {
    return "confirmed";
  }

  if (tombstoneScore <= -MIN_TOMBSTONE_MATURITY_SCORE) {
    return "rejected";
  }

  if (confirmVotes > 0 && rejectVotes > 0 && tombstoneScore === 0) {
    return "contested";
  }

  return "maturing";
}
