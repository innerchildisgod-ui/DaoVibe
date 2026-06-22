import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "kyc_identity_packet_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "kyc_identity_packet_node_b.db");

const ZONE = "kyc_identity_packet_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_kyc_identity_a";
const NODE_B_AUTHOR = "dev_public_key_kyc_identity_b";

function clearSqliteDatabase(dbPath: string): void {
  for (const filePath of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function assertSimulation(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createEngine(author: string, dbPath: string): LanguageEngine {
  return new LanguageEngine({
    zone: ZONE,
    author,
    nodeAgeGroup: "adult",
    dbPath,
  });
}

function runSimulation(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);

  const claim = nodeA.createKycClaim({
    kyc_claim_id: "sim_kyc_claim_001",
    subject_node_id: "sim_subject_node_001",
    country_hint: "IN",
    document_type_hint: "government_id",
    consent_text_hash: "sim_consent_text_hash",
    consented_at: 1_000,
  });

  const evidence = nodeA.prepareKycEvidence(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      evidence_id: "sim_kyc_evidence_001",
      evidence_kinds: ["id_face_crop", "current_selfie", "liveness_video"],
      evidence_bundle_hash: "sim_minimized_evidence_bundle_hash",
      full_id_shared: false,
      retention_expires_at: 2_000,
    },
    claim.packet.packet_id
  );

  const aiAssessment = nodeA.completeKycAiAssessment(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      assessment_id: "sim_kyc_ai_assessment_001",
      result: "unsure",
      face_match_score: 0.74,
      liveness_score: 0.92,
      spoof_risk_score: 0.07,
      reason: "human verification required",
    },
    evidence.packet.packet_id
  );

  const invite = nodeA.inviteKycKnownVerifier(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      verifier_node_id: "sim_known_verified_person_001",
      invite_id: "sim_kyc_invite_001",
      evidence_bundle_hash: "sim_minimized_evidence_bundle_hash",
      expires_at: 2_000,
    },
    aiAssessment.packet.packet_id
  );

  const vote = nodeA.voteKycKnownVerifier(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      invite_id: "sim_kyc_invite_001",
      verifier_node_id: "sim_known_verified_person_001",
      vote: "same_person",
      reason: "known verifier confirms identity continuity",
    },
    invite.packet.packet_id
  );

  const quorum = nodeA.recordKycQuorumResult(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      status: "needs_more_review",
      same_person_votes: 1,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "unsure",
      result_reason: "not enough verified people reviewed yet",
    },
    vote.packet.packet_id
  );

  nodeA.expireKycEvidence(
    {
      kyc_claim_id: "sim_kyc_claim_001",
      evidence_id: "sim_kyc_evidence_001",
      expired_at: 2_001,
      deletion_proof_hash: "sim_evidence_deletion_proof_hash",
    },
    quorum.packet.packet_id
  );

  assertSimulation(
    nodeA.packetCount() === 7,
    `Expected node A to store 7 KYC packets, got ${nodeA.packetCount()}`
  );

  assertSimulation(
    nodeA.listKnowledge().length === 0,
    "Expected KYC packets to leave language knowledge unchanged on node A"
  );

  const exportedPackets = nodeA.exportLedgerPackets();

  assertSimulation(
    exportedPackets.length === 7,
    `Expected 7 exported KYC packets, got ${exportedPackets.length}`
  );

  assertSimulation(
    exportedPackets.every((packet) => packet.packet_type.startsWith("kyc_")),
    "Expected every exported packet to be a KYC packet"
  );

  const evidencePacket = exportedPackets.find(
    (packet) => packet.packet_type === "kyc_evidence_prepared"
  );

  assertSimulation(
    Boolean(evidencePacket),
    "Expected exported KYC evidence packet"
  );

  assertSimulation(
    (evidencePacket?.payload as { full_id_shared?: boolean }).full_id_shared ===
      false,
    "Expected KYC evidence packet to prove full ID was not shared"
  );

  const importResult = nodeB.importLedgerPackets(exportedPackets);

  assertSimulation(
    importResult.accepted_new_count === 7,
    `Expected node B to accept 7 KYC packets, got ${importResult.accepted_new_count}`
  );

  assertSimulation(
    nodeB.packetCount() === 7,
    `Expected node B to store 7 KYC packets, got ${nodeB.packetCount()}`
  );

  assertSimulation(
    nodeB.listKnowledge().length === 0,
    "Expected synced KYC packets to leave language knowledge unchanged on node B"
  );

  const duplicateImportResult = nodeB.importLedgerPackets(exportedPackets);

  assertSimulation(
    duplicateImportResult.already_stored_count === 7,
    `Expected duplicate KYC import to count 7 already-stored packets, got ${duplicateImportResult.already_stored_count}`
  );

  console.log("KYC identity packet creation passed");
  console.log("KYC minimized evidence privacy flag passed");
  console.log("KYC ledger export passed");
  console.log("KYC ledger import passed");
  console.log("KYC duplicate import protection passed");
  console.log("KYC identity packet simulation succeeded.");
}

try {
  runSimulation();
} catch (error) {
  console.error("KYC identity packet simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
