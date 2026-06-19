import {
  MIN_CORRECTION_MATURITY_SCORE,
  type CorrectionStatus,
} from "./CorrectionStatus";

export type CorrectionCleanupReason =
  | "rejected_status"
  | "negative_score"
  | "losing_conflict_candidate";

export interface CorrectionCleanupFields {
  correction_id: string;
  reject_votes: number;
  correction_score: number;
  status: CorrectionStatus;
  conflict_rank: number;
  is_conflicting: boolean;
}

export type CorrectionCleanupCandidate<T extends CorrectionCleanupFields> = T & {
  cleanup_reasons: CorrectionCleanupReason[];
};

export function selectCorrectionCleanupCandidates<
  T extends CorrectionCleanupFields
>(corrections: T[]): CorrectionCleanupCandidate<T>[] {
  return corrections
    .map(toCorrectionCleanupCandidate)
    .filter(
      (candidate): candidate is CorrectionCleanupCandidate<T> =>
        candidate !== undefined
    )
    .sort(compareCorrectionCleanupCandidates);
}

function toCorrectionCleanupCandidate<T extends CorrectionCleanupFields>(
  correction: T
): CorrectionCleanupCandidate<T> | undefined {
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
  correction: CorrectionCleanupFields
): CorrectionCleanupReason[] {
  const reasons: CorrectionCleanupReason[] = [];

  if (correction.status === "rejected") {
    reasons.push("rejected_status");
  }

  if (correction.correction_score <= -MIN_CORRECTION_MATURITY_SCORE) {
    reasons.push("negative_score");
  }

  if (
    correction.is_conflicting &&
    correction.conflict_rank > 1 &&
    correction.correction_score <= -MIN_CORRECTION_MATURITY_SCORE
  ) {
    reasons.push("losing_conflict_candidate");
  }

  return reasons;
}

function compareCorrectionCleanupCandidates(
  left: CorrectionCleanupCandidate<CorrectionCleanupFields>,
  right: CorrectionCleanupCandidate<CorrectionCleanupFields>
): number {
  if (left.correction_score !== right.correction_score) {
    return left.correction_score - right.correction_score;
  }

  if (right.reject_votes !== left.reject_votes) {
    return right.reject_votes - left.reject_votes;
  }

  return left.correction_id.localeCompare(right.correction_id);
}
