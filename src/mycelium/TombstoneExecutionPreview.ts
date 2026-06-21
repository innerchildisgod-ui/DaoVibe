import {
  listCorrectionsForPhrase,
  type CorrectionSummary,
} from "./CorrectionLookup";
import type { PhraseLookupSource } from "./PhraseLookup";
import {
  listCorrectionTombstonesForPhrase,
  type CorrectionTombstoneSummary,
} from "./TombstoneLookup";

export interface TombstoneSuppressedCorrectionPreview {
  phrase_id: string;
  correction_id: string;
  correction_status: string;
  correction_score: number;
  tombstone_id: string;
  tombstone_reason: string;
  tombstone_score: number;
  tombstone_status: "confirmed";
}

export interface TombstoneActiveCorrectionPreview {
  phrase_id: string;
  correction_id: string;
  correction_status: string;
  correction_score: number;
}

export interface TombstoneExecutionPreviewResult {
  phrase_id: string;
  execution_enabled: boolean;
  suppressed_count: number;
  active_count: number;
  suppressed_corrections: TombstoneSuppressedCorrectionPreview[];
  active_corrections: TombstoneActiveCorrectionPreview[];
}

export interface TombstoneExecutionOptions {
  tombstoneExecutionEnabled?: boolean;
}

export function listTombstoneExecutionPreviewForPhrase(
  source: PhraseLookupSource,
  phraseId: string,
  options: TombstoneExecutionOptions = {}
): TombstoneExecutionPreviewResult {
  const correctionsResult = listCorrectionsForPhrase(source, phraseId);
  const tombstonesResult = listCorrectionTombstonesForPhrase(
    source,
    correctionsResult.phrase_id
  );

  return buildTombstoneExecutionPreview(
    correctionsResult.phrase_id,
    correctionsResult.corrections,
    tombstonesResult.tombstones,
    options
  );
}

export function buildTombstoneExecutionPreview(
  phraseId: string,
  corrections: CorrectionSummary[],
  tombstones: CorrectionTombstoneSummary[],
  options: TombstoneExecutionOptions = {}
): TombstoneExecutionPreviewResult {
  const confirmedTombstonesByCorrection =
    confirmedTombstonesByCorrectionForPhrase(phraseId, tombstones);

  const suppressedCorrections: TombstoneSuppressedCorrectionPreview[] = [];
  const activeCorrections: TombstoneActiveCorrectionPreview[] = [];

  for (const correction of corrections) {
    const confirmedTombstone = confirmedTombstonesByCorrection.get(
      correction.correction_id
    );

    if (confirmedTombstone) {
      suppressedCorrections.push(
        toSuppressedCorrectionPreview(correction, confirmedTombstone)
      );
    } else {
      activeCorrections.push(toActiveCorrectionPreview(correction));
    }
  }

  return {
    phrase_id: phraseId,
    execution_enabled: options.tombstoneExecutionEnabled === true,
    suppressed_count: suppressedCorrections.length,
    active_count: activeCorrections.length,
    suppressed_corrections: suppressedCorrections,
    active_corrections: activeCorrections,
  };
}

export function selectActiveCorrectionsForTombstoneExecution(
  phraseId: string,
  corrections: CorrectionSummary[],
  tombstones: CorrectionTombstoneSummary[]
): CorrectionSummary[] {
  const confirmedTombstonesByCorrection =
    confirmedTombstonesByCorrectionForPhrase(phraseId, tombstones);

  return corrections.filter(
    (correction) =>
      !confirmedTombstonesByCorrection.has(correction.correction_id)
  );
}

export function isConfirmedSuppressionTombstone(
  tombstone: CorrectionTombstoneSummary
): boolean {
  return tombstone.status === "confirmed" && tombstone.tombstone_score >= 3;
}

function confirmedTombstonesByCorrectionForPhrase(
  phraseId: string,
  tombstones: CorrectionTombstoneSummary[]
): Map<string, CorrectionTombstoneSummary> {
  const confirmedTombstonesByCorrection = new Map<
    string,
    CorrectionTombstoneSummary
  >();

  for (const tombstone of tombstones) {
    if (
      tombstone.phrase_id === phraseId &&
      isConfirmedSuppressionTombstone(tombstone) &&
      !confirmedTombstonesByCorrection.has(tombstone.correction_id)
    ) {
      confirmedTombstonesByCorrection.set(tombstone.correction_id, tombstone);
    }
  }

  return confirmedTombstonesByCorrection;
}

function toSuppressedCorrectionPreview(
  correction: CorrectionSummary,
  tombstone: CorrectionTombstoneSummary
): TombstoneSuppressedCorrectionPreview {
  return {
    phrase_id: correction.phrase_id,
    correction_id: correction.correction_id,
    correction_status: correction.status,
    correction_score: correction.correction_score,
    tombstone_id: tombstone.tombstone_id,
    tombstone_reason: tombstone.reason,
    tombstone_score: tombstone.tombstone_score,
    tombstone_status: "confirmed",
  };
}

function toActiveCorrectionPreview(
  correction: CorrectionSummary
): TombstoneActiveCorrectionPreview {
  return {
    phrase_id: correction.phrase_id,
    correction_id: correction.correction_id,
    correction_status: correction.status,
    correction_score: correction.correction_score,
  };
}
