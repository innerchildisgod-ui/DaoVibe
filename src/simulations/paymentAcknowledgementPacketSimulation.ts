import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { createPacket } from "../protocol/packet";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "payment_ack_packet_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "payment_ack_packet_node_b.db");

const ZONE = "payment_ack_packet_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_payment_ack_a";
const NODE_B_AUTHOR = "dev_public_key_payment_ack_b";

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
    payment_intent_id: "sim_payment_intent_for_ack_001",
    order_reference_id: "sim_order_for_payment_ack_001",
    buyer_subject_node_id: "sim_ack_buyer_subject_node_001",
    vendor_subject_node_id: "sim_ack_vendor_subject_node_001",
    buyer_kyc_claim_id: "sim_ack_buyer_kyc_claim_001",
    vendor_kyc_claim_id: "sim_ack_vendor_kyc_claim_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 25000,
    created_at: 2010,
    memo: "intent only; external rail handles settlement",
  });

  const proof = nodeA.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_intent_for_ack_001",
      proof_id: "sim_payment_proof_for_ack_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_for_ack_001",
      currency_code: "INR",
      amount_minor_units: 25000,
      submitted_at: 2020,
      memo: "hash only; no raw payment handle",
    },
    intent.packet.packet_id
  );

  nodeA.acknowledgePayment(
    {
      payment_intent_id: "sim_payment_intent_for_ack_001",
      proof_id: "sim_payment_proof_for_ack_001",
      acknowledgement_id: "sim_payment_ack_001",
      vendor_subject_node_id: "sim_ack_vendor_subject_node_001",
      status: "received",
      currency_code: "INR",
      amount_minor_units: 25000,
      acknowledged_at: 2030,
      reason: "vendor confirms received payment proof",
    },
    proof.packet.packet_id
  );

  assertSimulation(
    nodeA.packetCount() === 3,
    "Expected node A to store 3 payment packets, got " + nodeA.packetCount()
  );

  assertSimulation(
    nodeA.listKnowledge().length === 0,
    "Expected payment acknowledgement packets to leave language knowledge unchanged"
  );

  const exportedPackets = nodeA.exportLedgerPackets();
  const serializedLedger = JSON.stringify(exportedPackets);

  assertSimulation(
    exportedPackets.some((packet) => packet.packet_type === "payment_acknowledged"),
    "Expected exported payment acknowledgement packet"
  );

  assertSimulation(
    serializedLedger.includes("sim_payment_ack_001") &&
      serializedLedger.includes("received"),
    "Expected exported acknowledgement id and status"
  );

  const importResult = nodeB.importLedgerPackets(exportedPackets);

  assertSimulation(
    importResult.accepted_new_count === 3,
    "Expected node B to accept 3 packets, got " + importResult.accepted_new_count
  );

  assertSimulation(
    nodeB.packetCount() === 3,
    "Expected node B to store 3 packets, got " + nodeB.packetCount()
  );

  const invalidAcknowledgement = createPacket({
    packet_type: "payment_acknowledged",
    zone: ZONE,
    author: NODE_A_AUTHOR,
    payload: {
      payment_intent_id: "sim_payment_intent_for_invalid_ack_001",
      proof_id: "sim_payment_proof_for_invalid_ack_001",
      acknowledgement_id: "sim_payment_ack_invalid_001",
      vendor_subject_node_id: "sim_ack_vendor_subject_node_invalid_001",
      status: "lost",
      currency_code: "INR",
      amount_minor_units: 25000,
      acknowledged_at: 2030,
    },
  });

  const invalidImport = nodeB.importLedgerPackets([invalidAcknowledgement]);

  assertSimulation(
    invalidImport.rejected_invalid_count === 1,
    "Expected invalid acknowledgement status rejection, got " +
      invalidImport.rejected_invalid_count
  );

  assertSimulation(
    nodeB.packetCount() === 3,
    "Expected rejected acknowledgement to leave node B packet count at 3"
  );

  console.log("payment acknowledgement creation passed");
  console.log("payment acknowledgement event-only behavior passed");
  console.log("payment acknowledgement ledger export/import passed");
  console.log("payment acknowledgement invalid status rejection passed");
  console.log("Payment acknowledgement packet simulation succeeded.");
}

try {
  runSimulation();
} catch (error) {
  console.error("Payment acknowledgement packet simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
