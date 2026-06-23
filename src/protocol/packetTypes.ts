import { SafetyLabel } from "../safety/safetyLabels";

export type PacketType =
  | "phrase_observed"
  | "meaning_proposal"
  | "meaning_vote"
  | "correction"
  | "meaning_correction_proposed"
  | "meaning_correction_vote"
  | "meaning_correction_tombstone_proposed"
  | "meaning_correction_tombstone_vote"
  | "kyc_claim_created"
  | "kyc_evidence_prepared"
  | "kyc_ai_assessment_completed"
  | "kyc_known_verifier_invited"
  | "kyc_known_verifier_vote"
  | "kyc_quorum_result"
  | "kyc_evidence_expired"
  | "payment_intent_created"
  | "payment_proof_submitted"
  | "safety_label"
  | "symbol_sample";

export type InputType = "speech" | "text" | "symbol" | "drawing";

export type VoteValue = "confirm" | "reject" | "unsure";

export type CorrectionVoteValue = "confirm" | "reject";

export type KycEvidenceKind =
  | "id_face_crop"
  | "current_selfie"
  | "liveness_video";

export type KycAiAssessmentResult =
  | "pass"
  | "fail"
  | "unsure"
  | "suspicious"
  | "low_quality";

export type KycKnownVerifierVoteValue =
  | "same_person"
  | "not_same_person"
  | "unsure"
  | "suspicious"
  | "low_quality";

export type KycQuorumStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "needs_more_review"
  | "escalated"
  | "expired";

export type PaymentExternalRail =
  | "upi"
  | "card"
  | "bank_transfer"
  | "ach"
  | "sepa"
  | "pix"
  | "mobile_money"
  | "wallet"
  | "other";

export type CorrectionTombstoneReason =
  | "rejected_status"
  | "negative_score"
  | "losing_conflict_candidate"
  | "spam"
  | "malformed"
  | "other";

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

export interface MeaningCorrectionTombstoneProposedPayload {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  reason: CorrectionTombstoneReason;
  details?: string;
  proposer?: string;
}

export interface MeaningCorrectionTombstoneVotePayload {
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
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


export interface KycClaimCreatedPayload {
  kyc_claim_id: string;
  subject_node_id: string;
  country_hint?: string;
  document_type_hint?: string;
  consent_text_hash: string;
  consented_at: number;
}

export interface KycEvidencePreparedPayload {
  kyc_claim_id: string;
  evidence_id: string;
  evidence_kinds: KycEvidenceKind[];
  evidence_bundle_hash: string;
  full_id_shared: false;
  retention_expires_at: number;
}

export interface KycAiAssessmentCompletedPayload {
  kyc_claim_id: string;
  assessment_id: string;
  result: KycAiAssessmentResult;
  face_match_score?: number;
  liveness_score?: number;
  spoof_risk_score?: number;
  reason?: string;
}

export interface KycKnownVerifierInvitedPayload {
  kyc_claim_id: string;
  verifier_alias_id: string;
  invite_id: string;
  evidence_bundle_hash: string;
  expires_at: number;
}

export interface KycKnownVerifierVotePayload {
  kyc_claim_id: string;
  invite_id: string;
  verifier_alias_id: string;
  vote: KycKnownVerifierVoteValue;
  reason?: string;
}

export interface KycQuorumResultPayload {
  kyc_claim_id: string;
  status: KycQuorumStatus;
  same_person_votes: number;
  not_same_person_votes: number;
  unsure_votes: number;
  suspicious_votes: number;
  ai_result?: KycAiAssessmentResult;
  result_reason?: string;
}

export interface KycEvidenceExpiredPayload {
  kyc_claim_id: string;
  evidence_id: string;
  expired_at: number;
  deletion_proof_hash?: string;
}

export interface PaymentIntentCreatedPayload {
  payment_intent_id: string;
  order_reference_id: string;
  buyer_subject_node_id: string;
  vendor_subject_node_id: string;
  buyer_kyc_claim_id: string;
  vendor_kyc_claim_id: string;
  external_rail: PaymentExternalRail;
  currency_code: string;
  amount_minor_units: number;
  created_at: number;
  memo?: string;
}

export interface PaymentProofSubmittedPayload {
  payment_intent_id: string;
  proof_id: string;
  external_rail: PaymentExternalRail;
  external_reference_hash: string;
  currency_code: string;
  amount_minor_units: number;
  submitted_at: number;
  memo?: string;
}
