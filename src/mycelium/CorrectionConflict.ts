export interface RankedCorrectionFields {
  correction_id: string;
  confirm_votes: number;
  reject_votes: number;
  correction_score: number;
  conflict_group_id: string;
  conflict_rank: number;
  is_conflicting: boolean;
  proposal_created_at?: number;
}

export type PublicRankedCorrection<T extends RankedCorrectionFields> = Omit<
  T,
  "proposal_created_at"
>;

export function correctionConflictGroupId(
  phraseId: string,
  originalMeaningId: string
): string {
  return `${phraseId}::${originalMeaningId}`;
}

export function applyConflictMetadata<T extends RankedCorrectionFields>(
  corrections: T[]
): PublicRankedCorrection<T>[] {
  const groups = new Map<string, T[]>();

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
    .map(toPublicRankedCorrection);
}

export function compareRankedCorrections(
  left: RankedCorrectionFields,
  right: RankedCorrectionFields
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

function toPublicRankedCorrection<T extends RankedCorrectionFields>(
  correction: T
): PublicRankedCorrection<T> {
  const { proposal_created_at, ...publicCorrection } = correction;

  return publicCorrection;
}
