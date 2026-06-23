import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { createPacket } from "../protocol/packet";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "payment_proof_packet_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "payment_proof_packet_node_b.db");

const ZONE = "payment_proof_packet_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_payment_proof_a";
const NODE_B_AUTHOR = "dev_public_key_payment_proof_b";

function clearSqliteDatabase(dbPath: string): void {
  for (const filePath of [dbPath, dbPath + "-shm", dbPath + "-wal"]) {
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

  const intent = nodeA.createPaymentIntent({
    payment_intent_id: "sim_payment_intent_for_proof_001",
    order_reference_id: "sim_order_for_payment_proof_001",
    buyer_subject_node_id: "sim_proof_buyer_subject_node_001",
    vendor_subject_node_id: "sim_proof_vendor_subject_node_001",
    buyer_kyc_claim_id: "sim_proof_buyer_kyc_claim_001",
    vendor_kyc_claim_id: "sim_proof_vendor_kyc_claim_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 25000,
    created_at: 1010,
    memo: "intent only; external rail handles settlement",
  });

  nodeA.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_intent_for_proof_001",
      proof_id: "sim_payment_proof_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_001",
      currency_code: "INR",
      amount_minor_units: 25000,
      submitted_at: 1020,
      memo: "hash only; no raw payment handle",
    },
    intent.packet.packet_id
  );

  assertSimulation(
    nodeA.packetCount() === 2,
    "Expected node A to store 2 payment packets, got " + nodeA.packetCount()
  );

  assertSimulation(
    nodeA.listKnowledge().length === 0,
    "Expected payment packets to leave language knowledge unchanged"
  );

  const exportedPackets = nodeA.exportLedgerPackets();
  const serializedLedger = JSON.stringify(exportedPackets);

  assertSimulation(
    exportedPackets.some((packet) => packet.packet_type === "payment_proof_submitted"),
    "Expected exported payment proof packet"
  );

  assertSimulation(
    serializedLedger.includes("external_reference_hash"),
    "Expected payment proof to include external_reference_hash"
  );

  assertSimulation(
    !serializedLedger.includes("payer_upi_id") &&
      !serializedLedger.includes("payee_upi_id") &&
      !serializedLedger.includes("card_number"),
    "Expected payment proof ledger to avoid raw payment identifiers"
  );

  const importResult = nodeB.importLedgerPackets(exportedPackets);

  assertSimulation(
    importResult.accepted_new_count === 2,
    "Expected node B to accept 2 packets, got " + importResult.accepted_new_count
  );

  assertSimulation(
    nodeB.packetCount() === 2,
    "Expected node B to store 2 packets, got " + nodeB.packetCount()
  );

  const invalidProof = createPacket({
    packet_type: "payment_proof_submitted",
    zone: ZONE,
    author: NODE_A_AUTHOR,
    payload: {
      payment_intent_id: "sim_payment_intent_for_invalid_proof_001",
      proof_id: "sim_payment_proof_invalid_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_invalid_001",
      external_reference: "raw-reference-must-not-sync",
      payer_upi_id: "buyer@example-upi",
      currency_code: "INR",
      amount_minor_units: 25000,
      submitted_at: 1020,
    },
  });

  const invalidImport = nodeB.importLedgerPackets([invalidProof]);

  assertSimulation(
    invalidImport.rejected_invalid_count === 1,
    "Expected raw payment proof rejection, got " +
      invalidImport.rejected_invalid_count
  );

  assertSimulation(
    nodeB.packetCount() === 2,
    "Expected rejected raw proof packet to leave node B packet count at 2"
  );

  console.log("payment proof creation passed");
  console.log("payment proof hashed reference privacy passed");
  console.log("payment proof ledger export/import passed");
  console.log("payment proof raw reference rejection passed");
  console.log("Payment proof packet simulation succeeded.");
}

try {
  runSimulation();
} catch (error) {
  console.error("Payment proof packet simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
