import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_DB = path.join(DATA_DIR, "payment_status_summary_node.db");

const ZONE = "payment_status_summary_simulation_zone";
const AUTHOR = "dev_public_key_payment_status_summary";

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

function runSimulation(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_DB);

  const engine = new LanguageEngine({
    zone: ZONE,
    author: AUTHOR,
    nodeAgeGroup: "adult",
    dbPath: NODE_DB,
  });

  const missingSummary = engine.getPaymentStatusSummary(
    "sim_payment_status_missing"
  );

  assertSimulation(
    missingSummary.status === "missing",
    "Expected missing summary before intent"
  );

  const intent = engine.createPaymentIntent({
    payment_intent_id: "sim_payment_status_intent_001",
    order_reference_id: "sim_payment_status_order_001",
    buyer_subject_node_id: "sim_payment_status_buyer_001",
    vendor_subject_node_id: "sim_payment_status_vendor_001",
    buyer_kyc_claim_id: "sim_payment_status_buyer_kyc_001",
    vendor_kyc_claim_id: "sim_payment_status_vendor_kyc_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 5000,
    created_at: 7010,
  });

  const intentSummary = engine.getPaymentStatusSummary(
    "sim_payment_status_intent_001"
  );

  assertSimulation(
    intentSummary.status === "intent_created",
    "Expected intent_created after payment intent"
  );

  const proof = engine.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_status_intent_001",
      proof_id: "sim_payment_status_proof_001",
      external_rail: "upi",
      external_reference_hash: "sim_payment_status_external_hash_001",
      currency_code: "INR",
      amount_minor_units: 5000,
      submitted_at: 7020,
    },
    intent.packet.packet_id
  );

  const proofSummary = engine.getPaymentStatusSummary(
    "sim_payment_status_intent_001"
  );

  assertSimulation(
    proofSummary.status === "proof_submitted",
    "Expected proof_submitted after payment proof"
  );

  engine.acknowledgePayment(
    {
      payment_intent_id: "sim_payment_status_intent_001",
      proof_id: "sim_payment_status_proof_001",
      acknowledgement_id: "sim_payment_status_ack_001",
      vendor_subject_node_id: "sim_payment_status_vendor_001",
      status: "received",
      currency_code: "INR",
      amount_minor_units: 5000,
      acknowledged_at: 7030,
      reason: "vendor received payment proof",
    },
    proof.packet.packet_id
  );

  const receivedSummary = engine.getPaymentStatusSummary(
    "sim_payment_status_intent_001"
  );

  assertSimulation(
    receivedSummary.status === "vendor_received",
    "Expected vendor_received after acknowledgement"
  );

  assertSimulation(
    receivedSummary.intent_packet_id === intent.packet.packet_id,
    "Expected summary to include intent packet id"
  );

  assertSimulation(
    receivedSummary.proof_packet_id === proof.packet.packet_id,
    "Expected summary to include proof packet id"
  );

  assertSimulation(
    receivedSummary.acknowledgement_id === "sim_payment_status_ack_001",
    "Expected summary to include acknowledgement id"
  );

  assertSimulation(
    engine.packetCount() === 3,
    "Expected payment status summary to avoid creating packets"
  );

  assertSimulation(
    engine.listKnowledge().length === 0,
    "Expected payment status summary to avoid mutating language knowledge"
  );

  console.log("payment status missing state passed");
  console.log("payment status intent state passed");
  console.log("payment status proof state passed");
  console.log("payment status vendor received state passed");
  console.log("payment status read-only behavior passed");
  console.log("Payment status summary simulation succeeded.");
}

try {
  runSimulation();
} catch (error) {
  console.error("Payment status summary simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
