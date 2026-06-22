import type { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type {
  KycAiAssessmentCompletedPayload,
  KycClaimCreatedPayload,
  KycEvidenceExpiredPayload,
  KycEvidencePreparedPayload,
  KycKnownVerifierInvitedPayload,
  KycKnownVerifierVotePayload,
  KycKnownVerifierVoteValue,
  KycQuorumResultPayload,
  KycQuorumStatus,
  PacketType,
} from "../protocol/packetTypes";

const KYC_PACKET_TYPES = new Set<PacketType>([
  "kyc_claim_created",
  "kyc_evidence_prepared",
  "kyc_ai_assessment_completed",
  "kyc_known_verifier_invited",
  "kyc_known_verifier_vote",
  "kyc_quorum_result",
  "kyc_evidence_expired",
]);

export interface KycKnownVerifierVoteCounts {
  same_person: number;
  not_same_person: number;
  unsure: number;
  suspicious: number;
  low_quality: number;
}

export type KycClaimSummaryResult =
  | {
      found: false;
      kyc_claim_id: string;
      packet_count: number;
    }
  | {
      found: true;
      kyc_claim_id: string;
      subject_node_id: string;
      country_hint?: string;
      document_type_hint?: string;
      claim_packet_id: string;
      claimed_at: number;
      status: KycQuorumStatus;
      packet_count: number;
      evidence_count: number;
      evidence_bundle_hashes: string[];
      full_id_shared: boolean;
      evidence_expired: boolean;
      expired_evidence_ids: string[];
      latest_ai_result?: KycAiAssessmentCompletedPayload["result"];
      latest_ai_assessment_packet_id?: string;
      known_verifier_invite_count: number;
      known_verifier_vote_counts: KycKnownVerifierVoteCounts;
      latest_quorum_packet_id?: string;
      latest_quorum_reason?: string;
    };

export function listKycPackets(engine: LanguageEngine): LmpPacket[] {
  return engine
    .exportLedgerPackets()
    .filter((packet) => KYC_PACKET_TYPES.has(packet.packet_type))
    .sort(comparePacketsAscending);
}

export function getKycClaimSummary(
  engine: LanguageEngine,
  kycClaimId: string
): KycClaimSummaryResult {
  return summarizeKycPacketsForClaim(listKycPackets(engine), kycClaimId);
}

export function summarizeKycPacketsForClaim(
  packets: LmpPacket[],
  kycClaimId: string
): KycClaimSummaryResult {
  const normalizedClaimId = isNonEmptyString(kycClaimId) ? kycClaimId.trim() : kycClaimId;

  const claimPackets = packets
    .filter(isKycClaimCreatedPacket)
    .filter((packet) => packet.payload.kyc_claim_id === normalizedClaimId)
    .sort(comparePacketsAscending);

  const relatedPackets = packets
    .filter((packet) => packetBelongsToClaim(packet, normalizedClaimId))
    .sort(comparePacketsAscending);

  if (claimPackets.length === 0) {
    return {
      found: false,
      kyc_claim_id: normalizedClaimId,
      packet_count: relatedPackets.length,
    };
  }

  const claimPacket = claimPackets[0];
  const claimPayload = claimPacket.payload;

  const evidencePackets = relatedPackets.filter(isKycEvidencePreparedPacket);
  const aiAssessmentPackets = relatedPackets
    .filter(isKycAiAssessmentPacket)
    .sort(comparePacketsAscending);
  const invitePackets = relatedPackets.filter(isKycKnownVerifierInvitePacket);
  const votePackets = relatedPackets.filter(isKycKnownVerifierVotePacket);
  const quorumPackets = relatedPackets
    .filter(isKycQuorumResultPacket)
    .sort(comparePacketsAscending);
  const expiredEvidencePackets = relatedPackets.filter(
    isKycEvidenceExpiredPacket
  );

  const latestAiAssessment =
    aiAssessmentPackets.length > 0
      ? aiAssessmentPackets[aiAssessmentPackets.length - 1]
      : undefined;

  const latestQuorum =
    quorumPackets.length > 0
      ? quorumPackets[quorumPackets.length - 1]
      : undefined;

  return {
    found: true,
    kyc_claim_id: claimPayload.kyc_claim_id,
    subject_node_id: claimPayload.subject_node_id,
    country_hint: claimPayload.country_hint,
    document_type_hint: claimPayload.document_type_hint,
    claim_packet_id: claimPacket.packet_id,
    claimed_at: claimPayload.consented_at,
    status: latestQuorum?.payload.status ?? "pending",
    packet_count: relatedPackets.length,
    evidence_count: evidencePackets.length,
    evidence_bundle_hashes: uniqueSorted(
      evidencePackets.map((packet) => packet.payload.evidence_bundle_hash)
    ),
    full_id_shared: evidencePackets.some(
      (packet) => packet.payload.full_id_shared !== false
    ),
    evidence_expired: expiredEvidencePackets.length > 0,
    expired_evidence_ids: uniqueSorted(
      expiredEvidencePackets.map((packet) => packet.payload.evidence_id)
    ),
    latest_ai_result: latestAiAssessment?.payload.result,
    latest_ai_assessment_packet_id: latestAiAssessment?.packet_id,
    known_verifier_invite_count: uniqueInviteCount(invitePackets),
    known_verifier_vote_counts: countLatestKnownVerifierVotes(votePackets),
    latest_quorum_packet_id: latestQuorum?.packet_id,
    latest_quorum_reason: latestQuorum?.payload.result_reason,
  };
}

function packetBelongsToClaim(packet: LmpPacket, kycClaimId: string): boolean {
  if (!KYC_PACKET_TYPES.has(packet.packet_type)) {
    return false;
  }

  const payload = packet.payload as { kyc_claim_id?: unknown };

  return payload.kyc_claim_id === kycClaimId;
}

function countLatestKnownVerifierVotes(
  packets: LmpPacket<KycKnownVerifierVotePayload>[]
): KycKnownVerifierVoteCounts {
  const latestVoteByInviteVerifier = new Map<
    string,
    LmpPacket<KycKnownVerifierVotePayload>
  >();

  for (const packet of packets.sort(comparePacketsAscending)) {
    const key = JSON.stringify([
      packet.payload.invite_id,
      packet.payload.verifier_node_id,
    ]);
    const current = latestVoteByInviteVerifier.get(key);

    latestVoteByInviteVerifier.set(
      key,
      current === undefined
        ? packet
        : chooseLatestKnownVerifierVote(current, packet)
    );
  }

  const counts: KycKnownVerifierVoteCounts = {
    same_person: 0,
    not_same_person: 0,
    unsure: 0,
    suspicious: 0,
    low_quality: 0,
  };

  for (const packet of latestVoteByInviteVerifier.values()) {
    counts[packet.payload.vote] += 1;
  }

  return counts;
}

function chooseLatestKnownVerifierVote(
  current: LmpPacket<KycKnownVerifierVotePayload>,
  candidate: LmpPacket<KycKnownVerifierVotePayload>
): LmpPacket<KycKnownVerifierVotePayload> {
  if (candidate.parent === current.packet_id) {
    return candidate;
  }

  if (current.parent === candidate.packet_id) {
    return current;
  }

  return comparePacketsAscending(current, candidate) <= 0 ? candidate : current;
}

function uniqueInviteCount(
  packets: LmpPacket<KycKnownVerifierInvitedPayload>[]
): number {
  return new Set(
    packets.map((packet) =>
      JSON.stringify([packet.payload.invite_id, packet.payload.verifier_node_id])
    )
  ).size;
}

function isKycClaimCreatedPacket(
  packet: LmpPacket
): packet is LmpPacket<KycClaimCreatedPayload> {
  const payload = packet.payload as KycClaimCreatedPayload;

  return (
    packet.packet_type === "kyc_claim_created" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.subject_node_id) &&
    isNonEmptyString(payload.consent_text_hash) &&
    isFiniteNumber(payload.consented_at)
  );
}

function isKycEvidencePreparedPacket(
  packet: LmpPacket
): packet is LmpPacket<KycEvidencePreparedPayload> {
  const payload = packet.payload as KycEvidencePreparedPayload;

  return (
    packet.packet_type === "kyc_evidence_prepared" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.evidence_id) &&
    Array.isArray(payload.evidence_kinds) &&
    isNonEmptyString(payload.evidence_bundle_hash) &&
    payload.full_id_shared === false &&
    isFiniteNumber(payload.retention_expires_at)
  );
}

function isKycAiAssessmentPacket(
  packet: LmpPacket
): packet is LmpPacket<KycAiAssessmentCompletedPayload> {
  const payload = packet.payload as KycAiAssessmentCompletedPayload;

  return (
    packet.packet_type === "kyc_ai_assessment_completed" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.assessment_id) &&
    isKycAiResult(payload.result)
  );
}

function isKycKnownVerifierInvitePacket(
  packet: LmpPacket
): packet is LmpPacket<KycKnownVerifierInvitedPayload> {
  const payload = packet.payload as KycKnownVerifierInvitedPayload;

  return (
    packet.packet_type === "kyc_known_verifier_invited" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.verifier_node_id) &&
    isNonEmptyString(payload.invite_id) &&
    isNonEmptyString(payload.evidence_bundle_hash) &&
    isFiniteNumber(payload.expires_at)
  );
}

function isKycKnownVerifierVotePacket(
  packet: LmpPacket
): packet is LmpPacket<KycKnownVerifierVotePayload> {
  const payload = packet.payload as KycKnownVerifierVotePayload;

  return (
    packet.packet_type === "kyc_known_verifier_vote" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.invite_id) &&
    isNonEmptyString(payload.verifier_node_id) &&
    isKycKnownVerifierVote(payload.vote)
  );
}

function isKycQuorumResultPacket(
  packet: LmpPacket
): packet is LmpPacket<KycQuorumResultPayload> {
  const payload = packet.payload as KycQuorumResultPayload;

  return (
    packet.packet_type === "kyc_quorum_result" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isKycQuorumStatus(payload.status) &&
    isFiniteNumber(payload.same_person_votes) &&
    isFiniteNumber(payload.not_same_person_votes) &&
    isFiniteNumber(payload.unsure_votes) &&
    isFiniteNumber(payload.suspicious_votes)
  );
}

function isKycEvidenceExpiredPacket(
  packet: LmpPacket
): packet is LmpPacket<KycEvidenceExpiredPayload> {
  const payload = packet.payload as KycEvidenceExpiredPayload;

  return (
    packet.packet_type === "kyc_evidence_expired" &&
    isNonEmptyString(payload.kyc_claim_id) &&
    isNonEmptyString(payload.evidence_id) &&
    isFiniteNumber(payload.expired_at)
  );
}

function comparePacketsAscending(left: LmpPacket, right: LmpPacket): number {
  if (left.created_at !== right.created_at) {
    return left.created_at - right.created_at;
  }

  return left.packet_id.localeCompare(right.packet_id);
}

function isKycAiResult(
  value: unknown
): value is KycAiAssessmentCompletedPayload["result"] {
  return (
    value === "pass" ||
    value === "fail" ||
    value === "unsure" ||
    value === "suspicious" ||
    value === "low_quality"
  );
}

function isKycKnownVerifierVote(
  value: unknown
): value is KycKnownVerifierVoteValue {
  return (
    value === "same_person" ||
    value === "not_same_person" ||
    value === "unsure" ||
    value === "suspicious" ||
    value === "low_quality"
  );
}

function isKycQuorumStatus(value: unknown): value is KycQuorumStatus {
  return (
    value === "pending" ||
    value === "verified" ||
    value === "rejected" ||
    value === "needs_more_review" ||
    value === "escalated" ||
    value === "expired"
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
