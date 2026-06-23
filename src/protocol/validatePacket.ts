import { sha256, stableStringify } from "./hash";
import {
  createDevSignature,
  DEV_SIGNATURE_PREFIX,
  LMP_VERSION,
  LmpPacket,
  packetHashInput,
  packetSignatureInput,
} from "./packet";
import { PacketType } from "./packetTypes";

const SUPPORTED_PACKET_TYPES: Set<PacketType> = new Set([
  "phrase_observed",
  "meaning_proposal",
  "meaning_vote",
  "correction",
  "meaning_correction_proposed",
  "meaning_correction_vote",
  "meaning_correction_tombstone_proposed",
  "meaning_correction_tombstone_vote",
  "safety_label",
  "kyc_claim_created",
  "kyc_evidence_prepared",
  "kyc_ai_assessment_completed",
  "kyc_known_verifier_invited",
  "kyc_known_verifier_vote",
  "kyc_quorum_result",
  "kyc_evidence_expired",
  "payment_intent_created",
  "payment_proof_submitted",
  "payment_acknowledged",
  "order_fulfillment_started",
  "order_fulfillment_completed",
  "symbol_sample",
]);

export const CORRECTION_PACKET_FIELD_LIMITS = {
  phrase_id: 160,
  original_meaning_id: 160,
  correction_id: 160,
  corrected_reference_meaning: 2000,
  correction_context: 1000,
  source: 300,
  voter: 160,
  tombstone_id: 160,
  details: 1000,
  proposer: 160,
} as const;

const CORRECTION_TOMBSTONE_REASONS = new Set([
  "rejected_status",
  "negative_score",
  "losing_conflict_candidate",
  "spam",
  "malformed",
  "other",
]);

export const KYC_PACKET_FIELD_LIMITS = {
  kyc_claim_id: 160,
  verifier_alias_id: 160,
  invite_id: 160,
  evidence_bundle_hash: 300,
} as const;

export const PAYMENT_PACKET_FIELD_LIMITS = {
  payment_intent_id: 160,
  proof_id: 160,
  acknowledgement_id: 160,
  fulfillment_id: 160,
  completion_id: 160,
  external_reference_hash: 300,
  order_reference_id: 160,
  buyer_subject_node_id: 160,
  vendor_subject_node_id: 160,
  buyer_kyc_claim_id: 160,
  vendor_kyc_claim_id: 160,
  currency_code: 12,
  memo: 500,
  reason: 500,
} as const;

const PAYMENT_EXTERNAL_RAILS = new Set([
  "upi",
  "card",
  "bank_transfer",
  "ach",
  "sepa",
  "pix",
  "mobile_money",
  "wallet",
  "other",
]);

const PAYMENT_ACKNOWLEDGEMENT_STATUSES = new Set([
  "received",
  "not_received",
  "needs_review",
]);

const KYC_KNOWN_VERIFIER_VOTES = new Set([
  "same_person",
  "not_same_person",
  "unsure",
  "suspicious",
  "low_quality",
]);

export type PacketSignatureStatus =
  | "missing"
  | "dev_signature_valid"
  | "dev_signature_mismatch"
  | "legacy_placeholder"
  | "present_unverified";

export interface PacketValidationResult {
  valid: boolean;
  errors: string[];
  signature_status: PacketSignatureStatus;
  signature_input_hash?: string;
}

function asPayloadObject(payload: unknown): Record<string, unknown> | undefined {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return undefined;
}

function requirePayloadString(
  payload: Record<string, unknown>,
  fieldName: string,
  errors: string[]
): void {
  const value = payload[fieldName];

  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`Missing payload.${fieldName}`);
  }
}

function requirePayloadStringWithinLimit(
  payload: Record<string, unknown>,
  fieldName: string,
  maxLength: number,
  errors: string[]
): void {
  const value = payload[fieldName];

  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`Missing payload.${fieldName}`);
    return;
  }

  if (value.trim().length > maxLength) {
    errors.push(`Invalid payload.${fieldName}: max ${maxLength} characters`);
  }
}

function validateOptionalPayloadStringWithinLimit(
  payload: Record<string, unknown>,
  fieldName: string,
  maxLength: number,
  errors: string[]
): void {
  const value = payload[fieldName];

  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`Invalid payload.${fieldName}`);
    return;
  }

  if (value.trim().length > maxLength) {
    errors.push(`Invalid payload.${fieldName}: max ${maxLength} characters`);
  }
}

function validateMeaningCorrectionProposedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "phrase_id",
    CORRECTION_PACKET_FIELD_LIMITS.phrase_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "original_meaning_id",
    CORRECTION_PACKET_FIELD_LIMITS.original_meaning_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "correction_id",
    CORRECTION_PACKET_FIELD_LIMITS.correction_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "corrected_reference_meaning",
    CORRECTION_PACKET_FIELD_LIMITS.corrected_reference_meaning,
    errors
  );
  validateOptionalPayloadStringWithinLimit(
    payload,
    "correction_context",
    CORRECTION_PACKET_FIELD_LIMITS.correction_context,
    errors
  );
  validateOptionalPayloadStringWithinLimit(
    payload,
    "source",
    CORRECTION_PACKET_FIELD_LIMITS.source,
    errors
  );
}

function validateMeaningCorrectionVotePayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "phrase_id",
    CORRECTION_PACKET_FIELD_LIMITS.phrase_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "correction_id",
    CORRECTION_PACKET_FIELD_LIMITS.correction_id,
    errors
  );
  requirePayloadString(payload, "vote", errors);
  validateOptionalPayloadStringWithinLimit(
    payload,
    "voter",
    CORRECTION_PACKET_FIELD_LIMITS.voter,
    errors
  );

  if (
    typeof payload.vote === "string" &&
    payload.vote !== "confirm" &&
    payload.vote !== "reject"
  ) {
    errors.push("Invalid payload.vote");
  }
}

function validateMeaningCorrectionTombstoneProposedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "phrase_id",
    CORRECTION_PACKET_FIELD_LIMITS.phrase_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "correction_id",
    CORRECTION_PACKET_FIELD_LIMITS.correction_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "tombstone_id",
    CORRECTION_PACKET_FIELD_LIMITS.tombstone_id,
    errors
  );
  requirePayloadString(payload, "reason", errors);
  validateOptionalPayloadStringWithinLimit(
    payload,
    "details",
    CORRECTION_PACKET_FIELD_LIMITS.details,
    errors
  );
  validateOptionalPayloadStringWithinLimit(
    payload,
    "proposer",
    CORRECTION_PACKET_FIELD_LIMITS.proposer,
    errors
  );

  if (
    typeof payload.reason === "string" &&
    !CORRECTION_TOMBSTONE_REASONS.has(payload.reason)
  ) {
    errors.push("Invalid payload.reason");
  }
}

function validateMeaningCorrectionTombstoneVotePayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "phrase_id",
    CORRECTION_PACKET_FIELD_LIMITS.phrase_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "correction_id",
    CORRECTION_PACKET_FIELD_LIMITS.correction_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "tombstone_id",
    CORRECTION_PACKET_FIELD_LIMITS.tombstone_id,
    errors
  );
  requirePayloadString(payload, "vote", errors);
  validateOptionalPayloadStringWithinLimit(
    payload,
    "voter",
    CORRECTION_PACKET_FIELD_LIMITS.voter,
    errors
  );

  if (
    typeof payload.vote === "string" &&
    payload.vote !== "confirm" &&
    payload.vote !== "reject"
  ) {
    errors.push("Invalid payload.vote");
  }
}

function validateCorrectionPayload(packet: LmpPacket, errors: string[]): void {
  if (packet.packet_type === "meaning_correction_proposed") {
    validateMeaningCorrectionProposedPayload(packet, errors);
  }

  if (packet.packet_type === "meaning_correction_vote") {
    validateMeaningCorrectionVotePayload(packet, errors);
  }

  if (packet.packet_type === "meaning_correction_tombstone_proposed") {
    validateMeaningCorrectionTombstoneProposedPayload(packet, errors);
  }

  if (packet.packet_type === "meaning_correction_tombstone_vote") {
    validateMeaningCorrectionTombstoneVotePayload(packet, errors);
  }
}

function rejectLegacyVerifierNodeId(
  payload: Record<string, unknown>,
  errors: string[]
): void {
  if (payload.verifier_node_id !== undefined) {
    errors.push("Invalid payload.verifier_node_id: use verifier_alias_id");
  }
}

function validateKycKnownVerifierInvitedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  rejectLegacyVerifierNodeId(payload, errors);
  requirePayloadStringWithinLimit(
    payload,
    "kyc_claim_id",
    KYC_PACKET_FIELD_LIMITS.kyc_claim_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "verifier_alias_id",
    KYC_PACKET_FIELD_LIMITS.verifier_alias_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "invite_id",
    KYC_PACKET_FIELD_LIMITS.invite_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "evidence_bundle_hash",
    KYC_PACKET_FIELD_LIMITS.evidence_bundle_hash,
    errors
  );

  if (
    !Number.isInteger(payload.expires_at) ||
    Number(payload.expires_at) <= 0
  ) {
    errors.push("Invalid payload.expires_at");
  }
}

function validateKycKnownVerifierVotePayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  rejectLegacyVerifierNodeId(payload, errors);
  requirePayloadStringWithinLimit(
    payload,
    "kyc_claim_id",
    KYC_PACKET_FIELD_LIMITS.kyc_claim_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "invite_id",
    KYC_PACKET_FIELD_LIMITS.invite_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "verifier_alias_id",
    KYC_PACKET_FIELD_LIMITS.verifier_alias_id,
    errors
  );
  requirePayloadString(payload, "vote", errors);

  if (
    typeof payload.vote === "string" &&
    !KYC_KNOWN_VERIFIER_VOTES.has(payload.vote)
  ) {
    errors.push("Invalid payload.vote");
  }
}

function validateKycPayload(packet: LmpPacket, errors: string[]): void {
  if (packet.packet_type === "kyc_known_verifier_invited") {
    validateKycKnownVerifierInvitedPayload(packet, errors);
  }

  if (packet.packet_type === "kyc_known_verifier_vote") {
    validateKycKnownVerifierVotePayload(packet, errors);
  }
}

function rejectRawPaymentProofFields(
  payload: Record<string, unknown>,
  errors: string[]
): void {
  const forbiddenFields = [
    "external_reference",
    "raw_external_reference",
    "payment_reference",
    "upi_id",
    "payer_upi_id",
    "payee_upi_id",
    "card_number",
    "bank_account_number",
    "screenshot_hash",
    "screenshot_url",
  ];

  for (const field of forbiddenFields) {
    if (payload[field] !== undefined) {
      errors.push(`Invalid payload.${field}: store only external_reference_hash`);
    }
  }
}

function validatePaymentIntentCreatedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "payment_intent_id",
    PAYMENT_PACKET_FIELD_LIMITS.payment_intent_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "order_reference_id",
    PAYMENT_PACKET_FIELD_LIMITS.order_reference_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "buyer_subject_node_id",
    PAYMENT_PACKET_FIELD_LIMITS.buyer_subject_node_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "vendor_subject_node_id",
    PAYMENT_PACKET_FIELD_LIMITS.vendor_subject_node_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "buyer_kyc_claim_id",
    PAYMENT_PACKET_FIELD_LIMITS.buyer_kyc_claim_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "vendor_kyc_claim_id",
    PAYMENT_PACKET_FIELD_LIMITS.vendor_kyc_claim_id,
    errors
  );
  requirePayloadStringWithinLimit(
    payload,
    "currency_code",
    PAYMENT_PACKET_FIELD_LIMITS.currency_code,
    errors
  );

  if (
    typeof payload.currency_code === "string" &&
    !/^[A-Z]{3}$/.test(payload.currency_code)
  ) {
    errors.push("Invalid payload.currency_code");
  }

  requirePayloadString(payload, "external_rail", errors);

  if (
    typeof payload.external_rail === "string" &&
    !PAYMENT_EXTERNAL_RAILS.has(payload.external_rail)
  ) {
    errors.push("Invalid payload.external_rail");
  }

  if (
    !Number.isInteger(payload.amount_minor_units) ||
    Number(payload.amount_minor_units) <= 0
  ) {
    errors.push("Invalid payload.amount_minor_units");
  }

  if (
    !Number.isInteger(payload.created_at) ||
    Number(payload.created_at) <= 0
  ) {
    errors.push("Invalid payload.created_at");
  }

  if (
    payload.memo !== undefined &&
    (typeof payload.memo !== "string" ||
      payload.memo.trim().length === 0 ||
      payload.memo.length > PAYMENT_PACKET_FIELD_LIMITS.memo)
  ) {
    errors.push("Invalid payload.memo");
  }
}

function validatePaymentProofSubmittedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  rejectRawPaymentProofFields(payload, errors);

  requirePayloadStringWithinLimit(
    payload,
    "payment_intent_id",
    PAYMENT_PACKET_FIELD_LIMITS.payment_intent_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "proof_id",
    PAYMENT_PACKET_FIELD_LIMITS.proof_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "external_reference_hash",
    PAYMENT_PACKET_FIELD_LIMITS.external_reference_hash,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "currency_code",
    PAYMENT_PACKET_FIELD_LIMITS.currency_code,
    errors
  );

  if (
    typeof payload.currency_code === "string" &&
    !/^[A-Z]{3}$/.test(payload.currency_code)
  ) {
    errors.push("Invalid payload.currency_code");
  }

  requirePayloadString(payload, "external_rail", errors);

  if (
    typeof payload.external_rail === "string" &&
    !PAYMENT_EXTERNAL_RAILS.has(payload.external_rail)
  ) {
    errors.push("Invalid payload.external_rail");
  }

  if (
    !Number.isInteger(payload.amount_minor_units) ||
    Number(payload.amount_minor_units) <= 0
  ) {
    errors.push("Invalid payload.amount_minor_units");
  }

  if (
    !Number.isInteger(payload.submitted_at) ||
    Number(payload.submitted_at) <= 0
  ) {
    errors.push("Invalid payload.submitted_at");
  }

  if (
    payload.memo !== undefined &&
    (typeof payload.memo !== "string" ||
      payload.memo.trim().length === 0 ||
      payload.memo.length > PAYMENT_PACKET_FIELD_LIMITS.memo)
  ) {
    errors.push("Invalid payload.memo");
  }
}

function validatePaymentAcknowledgedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "payment_intent_id",
    PAYMENT_PACKET_FIELD_LIMITS.payment_intent_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "proof_id",
    PAYMENT_PACKET_FIELD_LIMITS.proof_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "acknowledgement_id",
    PAYMENT_PACKET_FIELD_LIMITS.acknowledgement_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "vendor_subject_node_id",
    PAYMENT_PACKET_FIELD_LIMITS.vendor_subject_node_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "currency_code",
    PAYMENT_PACKET_FIELD_LIMITS.currency_code,
    errors
  );

  if (
    typeof payload.currency_code === "string" &&
    !/^[A-Z]{3}$/.test(payload.currency_code)
  ) {
    errors.push("Invalid payload.currency_code");
  }

  requirePayloadString(payload, "status", errors);

  if (
    typeof payload.status === "string" &&
    !PAYMENT_ACKNOWLEDGEMENT_STATUSES.has(payload.status)
  ) {
    errors.push("Invalid payload.status");
  }

  if (
    !Number.isInteger(payload.amount_minor_units) ||
    Number(payload.amount_minor_units) <= 0
  ) {
    errors.push("Invalid payload.amount_minor_units");
  }

  if (
    !Number.isInteger(payload.acknowledged_at) ||
    Number(payload.acknowledged_at) <= 0
  ) {
    errors.push("Invalid payload.acknowledged_at");
  }

  if (
    payload.reason !== undefined &&
    (typeof payload.reason !== "string" ||
      payload.reason.trim().length === 0 ||
      payload.reason.length > PAYMENT_PACKET_FIELD_LIMITS.reason)
  ) {
    errors.push("Invalid payload.reason");
  }
}

function validateOrderFulfillmentStartedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "order_reference_id",
    PAYMENT_PACKET_FIELD_LIMITS.order_reference_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "payment_intent_id",
    PAYMENT_PACKET_FIELD_LIMITS.payment_intent_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "proof_id",
    PAYMENT_PACKET_FIELD_LIMITS.proof_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "acknowledgement_id",
    PAYMENT_PACKET_FIELD_LIMITS.acknowledgement_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "fulfillment_id",
    PAYMENT_PACKET_FIELD_LIMITS.fulfillment_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "vendor_subject_node_id",
    PAYMENT_PACKET_FIELD_LIMITS.vendor_subject_node_id,
    errors
  );

  if (
    !Number.isInteger(payload.started_at) ||
    Number(payload.started_at) <= 0
  ) {
    errors.push("Invalid payload.started_at");
  }

  if (
    payload.memo !== undefined &&
    (typeof payload.memo !== "string" ||
      payload.memo.trim().length === 0 ||
      payload.memo.length > PAYMENT_PACKET_FIELD_LIMITS.memo)
  ) {
    errors.push("Invalid payload.memo");
  }
}

function validateOrderFulfillmentCompletedPayload(
  packet: LmpPacket,
  errors: string[]
): void {
  const payload = asPayloadObject(packet.payload);

  if (!payload) {
    errors.push("Missing payload");
    return;
  }

  requirePayloadStringWithinLimit(
    payload,
    "order_reference_id",
    PAYMENT_PACKET_FIELD_LIMITS.order_reference_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "payment_intent_id",
    PAYMENT_PACKET_FIELD_LIMITS.payment_intent_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "proof_id",
    PAYMENT_PACKET_FIELD_LIMITS.proof_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "acknowledgement_id",
    PAYMENT_PACKET_FIELD_LIMITS.acknowledgement_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "fulfillment_id",
    PAYMENT_PACKET_FIELD_LIMITS.fulfillment_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "completion_id",
    PAYMENT_PACKET_FIELD_LIMITS.completion_id,
    errors
  );

  requirePayloadStringWithinLimit(
    payload,
    "vendor_subject_node_id",
    PAYMENT_PACKET_FIELD_LIMITS.vendor_subject_node_id,
    errors
  );

  if (
    !Number.isInteger(payload.completed_at) ||
    Number(payload.completed_at) <= 0
  ) {
    errors.push("Invalid payload.completed_at");
  }

  if (
    payload.memo !== undefined &&
    (typeof payload.memo !== "string" ||
      payload.memo.trim().length === 0 ||
      payload.memo.length > PAYMENT_PACKET_FIELD_LIMITS.memo)
  ) {
    errors.push("Invalid payload.memo");
  }
}

function validatePaymentPayload(packet: LmpPacket, errors: string[]): void {
  if (packet.packet_type === "payment_intent_created") {
    validatePaymentIntentCreatedPayload(packet, errors);
  }

  if (packet.packet_type === "payment_proof_submitted") {
    validatePaymentProofSubmittedPayload(packet, errors);
  }

  if (packet.packet_type === "payment_acknowledged") {
    validatePaymentAcknowledgedPayload(packet, errors);
  }

  if (packet.packet_type === "order_fulfillment_started") {
    validateOrderFulfillmentStartedPayload(packet, errors);
  }

  if (packet.packet_type === "order_fulfillment_completed") {
    validateOrderFulfillmentCompletedPayload(packet, errors);
  }
}

export function validatePacket(packet: LmpPacket): PacketValidationResult {
  const errors: string[] = [];
  let signatureStatus: PacketSignatureStatus = "missing";

  if (packet.version !== LMP_VERSION) {
    errors.push(`Unsupported version: ${packet.version}`);
  }

  if (!SUPPORTED_PACKET_TYPES.has(packet.packet_type)) {
    errors.push(`Unsupported packet type: ${packet.packet_type}`);
  }

  validateCorrectionPayload(packet, errors);
  validateKycPayload(packet, errors);
  validatePaymentPayload(packet, errors);

  if (!packet.packet_id) errors.push("Missing packet_id");
  if (!packet.zone) errors.push("Missing zone");
  if (!packet.author) errors.push("Missing author");

  if (!Number.isInteger(packet.created_at) || packet.created_at <= 0) {
    errors.push("Invalid created_at");
  }

  if (
    packet.expires_at !== undefined &&
    (!Number.isInteger(packet.expires_at) || packet.expires_at <= 0)
  ) {
    errors.push("Invalid expires_at");
  }

  if (!packet.signature) {
    errors.push("Missing signature");
  }

  const expectedPayloadHash = sha256(stableStringify(packet.payload));

  if (packet.payload_hash !== expectedPayloadHash) {
    errors.push("Invalid payload_hash");
  }

  const expectedPacketId = sha256(
    stableStringify(
      packetHashInput({
        version: packet.version,
        packet_type: packet.packet_type,
        created_at: packet.created_at,
        expires_at: packet.expires_at,
        zone: packet.zone,
        author: packet.author,
        parent: packet.parent,
        payload_hash: packet.payload_hash,
        payload: packet.payload,
      })
    )
  );

  if (packet.packet_id !== expectedPacketId) {
    errors.push("Invalid packet_id");
  }

  const signatureInputHash = sha256(stableStringify(packetSignatureInput(packet)));

  if (packet.signature === "dev_signature_placeholder") {
    signatureStatus = "legacy_placeholder";
  } else if (packet.signature) {
    const expectedDevSignature = createDevSignature(
      packet.author,
      packet.packet_id
    );

    if (packet.signature === expectedDevSignature) {
      signatureStatus = "dev_signature_valid";
    } else if (packet.signature.startsWith(`${DEV_SIGNATURE_PREFIX}:`)) {
      signatureStatus = "dev_signature_mismatch";
      errors.push("Invalid dev signature");
    } else {
      signatureStatus = "present_unverified";
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    signature_status: signatureStatus,
    signature_input_hash: signatureInputHash,
  };
}
