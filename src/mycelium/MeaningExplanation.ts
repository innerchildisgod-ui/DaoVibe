import type { KnowledgePhraseRecord } from "../storage/sqliteStore";
import type { BestMeaningDetails, BestMeaningResult } from "./PhraseLookup";
import type { CorrectionSummary } from "./CorrectionLookup";
import type { CorrectionTombstoneSummary } from "./TombstoneLookup";

export type BestMeaningExplanationSource = "base_meaning" | "correction";

export interface BestMeaningExplanationPhrase {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label?: string;
}

export interface BestMeaningExplanationBestMeaning {
  meaning_id?: string;
  reference_meaning?: string;
  confidence?: number;
  score?: number;
  confirms?: number;
  rejects?: number;
  total_votes?: number;
  source: BestMeaningExplanationSource;
}

export interface BestMeaningExplanationDetails {
  summary: string;
  reasons: string[];
  tombstone_execution_enabled: false;
}

export interface BestMeaningExplanationEvidence {
  meaning_count: number;
  correction_count: number;
  confirmed_correction_count: number;
  maturing_correction_count: number;
  tombstone_count: number;
  confirmed_tombstone_count: number;
}

export interface BestMeaningExplanationResult {
  phrase_id: string;
  phrase?: BestMeaningExplanationPhrase;
  best_meaning?: BestMeaningExplanationBestMeaning;
  explanation: BestMeaningExplanationDetails;
  evidence: BestMeaningExplanationEvidence;
}

export interface BuildBestMeaningExplanationInput {
  phraseId: string;
  phrase?: KnowledgePhraseRecord;
  bestMeaningResult: BestMeaningResult;
  corrections: CorrectionSummary[];
  tombstones: CorrectionTombstoneSummary[];
}

export function buildBestMeaningExplanation(
  input: BuildBestMeaningExplanationInput
): BestMeaningExplanationResult {
  const phraseId = input.phrase?.phrase_id ?? input.phraseId.trim();
  const evidence = buildEvidence(
    input.phrase,
    input.corrections,
    input.tombstones
  );
  const bestMeaning = toExplanationBestMeaning(
    input.bestMeaningResult.best_meaning
  );
  const source = bestMeaning?.source;
  const summary = buildSummary(source, input.bestMeaningResult);
  const reasons = buildReasons({
    phraseId,
    phrase: input.phrase,
    bestMeaning: input.bestMeaningResult.best_meaning,
    source,
    corrections: input.corrections,
    tombstones: input.tombstones,
    evidence,
    bestMeaningReason: input.bestMeaningResult.reason,
  });

  return {
    phrase_id: phraseId,
    phrase: input.phrase ? toExplanationPhrase(input.phrase) : undefined,
    best_meaning: bestMeaning,
    explanation: {
      summary,
      reasons,
      tombstone_execution_enabled: false,
    },
    evidence,
  };
}

function buildEvidence(
  phrase: KnowledgePhraseRecord | undefined,
  corrections: CorrectionSummary[],
  tombstones: CorrectionTombstoneSummary[]
): BestMeaningExplanationEvidence {
  return {
    meaning_count: phrase?.meanings.length ?? 0,
    correction_count: corrections.length,
    confirmed_correction_count: corrections.filter(
      (correction) => correction.status === "confirmed"
    ).length,
    maturing_correction_count: corrections.filter(
      (correction) => correction.status === "maturing"
    ).length,
    tombstone_count: tombstones.length,
    confirmed_tombstone_count: tombstones.filter(
      (tombstone) => tombstone.status === "confirmed"
    ).length,
  };
}

function buildSummary(
  source: BestMeaningExplanationSource | undefined,
  bestMeaningResult: BestMeaningResult
): string {
  if (!bestMeaningResult.has_best_meaning) {
    return "This node knows the phrase, but it has no proposed meanings yet.";
  }

  if (source === "correction") {
    return "This node selects a correction as the best meaning because its ranked correction score beats the current base meaning.";
  }

  return "This node selects the highest-scoring base meaning from local phrase knowledge.";
}

function buildReasons(args: {
  phraseId: string;
  phrase?: KnowledgePhraseRecord;
  bestMeaning: BestMeaningDetails | null;
  source?: BestMeaningExplanationSource;
  corrections: CorrectionSummary[];
  tombstones: CorrectionTombstoneSummary[];
  evidence: BestMeaningExplanationEvidence;
  bestMeaningReason?: string;
}): string[] {
  const reasons: string[] = [];

  if (!args.phrase) {
    return [
      `Phrase ${args.phraseId} was not found in this node's local phrase knowledge.`,
      "Tombstone execution is disabled; explanations do not delete, suppress, or rewrite packet history.",
    ];
  }

  reasons.push(
    `Phrase ${args.phrase.phrase_id} exists in local knowledge with ${args.evidence.meaning_count} proposed base meaning(s).`
  );

  if (!args.bestMeaning) {
    reasons.push(
      args.bestMeaningReason ??
        "No meanings have been proposed for this phrase yet."
    );
  } else if (args.source === "correction") {
    const selectedCorrection = args.corrections.find(
      (correction) => correction.correction_id === args.bestMeaning?.correction_id
    );

    reasons.push(
      `Correction ${args.bestMeaning.correction_id} currently outranks the strongest base meaning with score ${args.bestMeaning.score}.`
    );

    if (selectedCorrection) {
      reasons.push(
        `That correction has ${selectedCorrection.confirm_votes} confirm vote(s), ${selectedCorrection.reject_votes} reject vote(s), and status ${selectedCorrection.status}.`
      );
    }
  } else {
    reasons.push(
      `Base meaning ${args.bestMeaning.meaning_id} has the highest local score among base meanings and active correction candidates.`
    );
    reasons.push(
      `It has confidence ${args.bestMeaning.confidence}, ${args.bestMeaning.confirms} confirm vote(s), ${args.bestMeaning.rejects} reject vote(s), and score ${args.bestMeaning.score}.`
    );
  }

  if (args.evidence.correction_count === 0) {
    reasons.push("No correction packets are present for this phrase.");
  } else {
    reasons.push(
      `Correction evidence: ${args.evidence.correction_count} proposal(s), ${args.evidence.confirmed_correction_count} confirmed, ${args.evidence.maturing_correction_count} maturing.`
    );
  }

  if (args.evidence.tombstone_count === 0) {
    reasons.push("No correction tombstone packets are present for this phrase.");
  } else {
    reasons.push(
      `Tombstone evidence is preview-only: ${args.evidence.tombstone_count} tombstone proposal(s), ${args.evidence.confirmed_tombstone_count} confirmed.`
    );
  }

  reasons.push(
    "Tombstone execution is disabled; explanations do not delete, suppress, or rewrite packet history."
  );

  return reasons;
}

function toExplanationPhrase(
  phrase: KnowledgePhraseRecord
): BestMeaningExplanationPhrase {
  return {
    phrase_id: phrase.phrase_id,
    surface_text: phrase.surface_text,
    phonetic_hint: phrase.phonetic_hint,
    language_hint: phrase.language_hint,
    safety_label: phrase.safety_label,
  };
}

function toExplanationBestMeaning(
  bestMeaning: BestMeaningDetails | null
): BestMeaningExplanationBestMeaning | undefined {
  if (!bestMeaning) {
    return undefined;
  }

  return {
    meaning_id: bestMeaning.meaning_id,
    reference_meaning: bestMeaning.reference_meaning,
    confidence: bestMeaning.confidence,
    score: bestMeaning.score,
    confirms: bestMeaning.confirms,
    rejects: bestMeaning.rejects,
    total_votes: bestMeaning.total_votes,
    source: bestMeaning.source === "correction" ? "correction" : "base_meaning",
  };
}
