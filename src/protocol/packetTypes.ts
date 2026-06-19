import { SafetyLabel } from "../safety/safetyLabels";

export type PacketType =
  | "phrase_observed"
  | "meaning_proposal"
  | "meaning_vote"
  | "correction"
  | "meaning_correction_proposed"
  | "meaning_correction_vote"
  | "safety_label"
  | "symbol_sample";

export type InputType = "speech" | "text" | "symbol" | "drawing";

export type VoteValue = "confirm" | "reject" | "unsure";

export type CorrectionVoteValue = "confirm" | "reject";

export interface PhraseObservedPayload {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  input_type: InputType;
}

export interface MeaningProposalPayload {
  phrase_id: string;
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
}

export interface MeaningVotePayload {
  phrase_id: string;
  meaning_id: string;
  vote: VoteValue;
  confidence: number;
}

export interface MeaningCorrectionProposedPayload {
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
}

export interface MeaningCorrectionVotePayload {
  phrase_id: string;
  correction_id: string;
  vote: CorrectionVoteValue;
  voter?: string;
}

export interface SafetyLabelPayload {
  phrase_id: string;
  label: SafetyLabel;
  reason?: string;
}

export interface SymbolSamplePayload {
  symbol_id: string;
  phrase_id: string;
  image_hash?: string;
  stroke_data_hash?: string;
  phonetic_hint?: string;
}
