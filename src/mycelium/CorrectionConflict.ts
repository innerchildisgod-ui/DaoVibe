export interface RankedCorrectionFields {
  correction_id: string;
  confirm_votes: number;
  reject_votes: number;
  correction_score: number;
  conflict_group_id: string;
  conflict_rank: number;
  is_conflicting: boolean;
  proposal_packet_id?: string;
}

export type PublicRankedCorrection<T extends RankedCorrectionFields> = Omit<
  T,
  "proposal_packet_id"
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

  if (left.correction_id !== right.correction_id) {
    return left.correction_id.localeCompare(right.correction_id);
  }

  return compareOptionalStrings(left.proposal_packet_id, right.proposal_packet_id);
}

function toPublicRankedCorrection<T extends RankedCorrectionFields>(
  correction: T
): PublicRankedCorrection<T> {
  const { proposal_packet_id, ...publicCorrection } = correction;

  return publicCorrection;
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
