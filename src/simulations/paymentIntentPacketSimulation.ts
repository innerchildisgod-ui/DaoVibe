import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { getKycClaimSummary } from "../mycelium/KycLookup";
import { createPacket } from "../protocol/packet";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "payment_intent_packet_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "payment_intent_packet_node_b.db");

const ZONE = "payment_intent_packet_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_payment_intent_a";
const NODE_B_AUTHOR = "dev_public_key_payment_intent_b";

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

  const buyerClaim = nodeA.createKycClaim({
    kyc_claim_id: "sim_buyer_kyc_claim_001",
    subject_node_id: "sim_buyer_subject_node_001",
    country_hint: "IN",
    document_type_hint: "government_id",
    consent_text_hash: "sim_buyer_consent_hash",
    consented_at: 1_000,
  });

  const buyerQuorum = nodeA.recordKycQuorumResult(
    {
      kyc_claim_id: "sim_buyer_kyc_claim_001",
      status: "verified",
      same_person_votes: 3,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "pass",
      result_reason: "buyer quorum passed",
    },
    buyerClaim.packet.packet_id
  );

  const vendorClaim = nodeA.createKycClaim(
    {
      kyc_claim_id: "sim_vendor_kyc_claim_001",
      subject_node_id: "sim_vendor_subject_node_001",
      country_hint: "IN",
      document_type_hint: "business_or_government_id",
      consent_text_hash: "sim_vendor_consent_hash",
      consented_at: 1_001,
    },
    buyerQuorum.packet.packet_id
  );

  const vendorQuorum = nodeA.recordKycQuorumResult(
    {
      kyc_claim_id: "sim_vendor_kyc_claim_001",
      status: "verified",
      same_person_votes: 3,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "pass",
      result_reason: "vendor quorum passed",
    },
    vendorClaim.packet.packet_id
  );

  const buyerSummary = getKycClaimSummary(nodeA, "sim_buyer_kyc_claim_001");
  const vendorSummary = getKycClaimSummary(nodeA, "sim_vendor_kyc_claim_001");

  assertSimulation(
    buyerSummary.found && buyerSummary.is_kyc_verified,
    "Expected buyer KYC summary to be verified before payment intent"
  );
  assertSimulation(
    vendorSummary.found && vendorSummary.is_kyc_verified,
    "Expected vendor KYC summary to be verified before payment intent"
  );

  nodeA.createPaymentIntent(
    {
      payment_intent_id: "sim_payment_intent_001",
      order_reference_id: "sim_order_001",
      buyer_subject_node_id: "sim_buyer_subject_node_001",
      vendor_subject_node_id: "sim_vendor_subject_node_001",
      buyer_kyc_claim_id: "sim_buyer_kyc_claim_001",
      vendor_kyc_claim_id: "sim_vendor_kyc_claim_001",
      external_rail: "upi",
      currency_code: "INR",
      amount_minor_units: 25_000,
      created_at: 1_010,
      memo: "intent only; external rail handles settlement",
    },
    vendorQuorum.packet.packet_id
  );

  assertSimulation(
    nodeA.packetCount() === 5,
    `Expected node A to store 5 packets, got ${nodeA.packetCount()}`
  );

  assertSimulation(
    nodeA.listKnowledge().length === 0,
    "Expected payment/KYC packets to leave language knowledge unchanged"
  );

  const exportedPackets = nodeA.exportLedgerPackets();
  const paymentIntentPacket = exportedPackets.find(
    (packet) => packet.packet_type === "payment_intent_created"
  );

  assertSimulation(Boolean(paymentIntentPacket), "Expected payment intent packet");
  assertSimulation(
    (paymentIntentPacket?.payload as { external_rail?: string }).external_rail ===
      "upi",
    "Expected payment intent to record external rail"
  );

  const importResult = nodeB.importLedgerPackets(exportedPackets);

  assertSimulation(
    importResult.accepted_new_count === 5,
    `Expected node B to accept 5 packets, got ${importResult.accepted_new_count}`
  );

  assertSimulation(
    nodeB.packetCount() === 5,
    `Expected node B to store 5 packets, got ${nodeB.packetCount()}`
  );

  const invalidPaymentIntent = createPacket({
    packet_type: "payment_intent_created",
    zone: ZONE,
    author: NODE_A_AUTHOR,
    payload: {
      payment_intent_id: "sim_payment_intent_invalid_001",
      order_reference_id: "sim_order_invalid_001",
      buyer_subject_node_id: "sim_buyer_subject_node_invalid_001",
      vendor_subject_node_id: "sim_vendor_subject_node_invalid_001",
      buyer_kyc_claim_id: "sim_buyer_kyc_claim_invalid_001",
      vendor_kyc_claim_id: "sim_vendor_kyc_claim_invalid_001",
      external_rail: "cash_under_table",
      currency_code: "INR",
      amount_minor_units: 0,
      created_at: 1_010,
    },
  });

  const invalidImport = nodeB.importLedgerPackets([invalidPaymentIntent]);

  assertSimulation(
    invalidImport.rejected_invalid_count === 1,
    `Expected invalid payment intent rejection, got ${invalidImport.rejected_invalid_count}`
  );

  console.log("payment intent creation passed");
  console.log("payment intent KYC gate precondition passed");
  console.log("payment intent ledger export/import passed");
  console.log("payment intent invalid import rejection passed");
  console.log("Payment intent packet simulation succeeded.");
}

try {
  runSimulation();
} catch (error) {
  console.error("Payment intent packet simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
