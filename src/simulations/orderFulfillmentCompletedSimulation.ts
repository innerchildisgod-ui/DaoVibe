import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LanguageEngine } from "../engine";
import { createPacket } from "../protocol/packet";

const NODE_DB = join(process.cwd(), "data", "order_fulfillment_completed_node.db");
const IMPORT_NODE_DB = join(
  process.cwd(),
  "data",
  "order_fulfillment_completed_import_node.db"
);

function assertSimulation(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function removeIfExists(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function resetNodeDb(): void {
  removeIfExists(NODE_DB);
  removeIfExists(`${NODE_DB}-shm`);
  removeIfExists(`${NODE_DB}-wal`);

  removeIfExists(IMPORT_NODE_DB);
  removeIfExists(`${IMPORT_NODE_DB}-shm`);
  removeIfExists(`${IMPORT_NODE_DB}-wal`);
}

function runSimulation(): void {
  resetNodeDb();

  const engine = new LanguageEngine({
    zone: "order_fulfillment_completed_zone",
    author: "order_fulfillment_completed_vendor",
    nodeAgeGroup: "adult",
    dbPath: NODE_DB,
  });

  const intent = engine.createPaymentIntent({
    payment_intent_id: "sim_payment_intent_for_completion_001",
    order_reference_id: "sim_order_for_completion_001",
    buyer_subject_node_id: "sim_buyer_subject_node_for_completion_001",
    vendor_subject_node_id: "sim_vendor_subject_node_for_completion_001",
    buyer_kyc_claim_id: "sim_buyer_kyc_claim_for_completion_001",
    vendor_kyc_claim_id: "sim_vendor_kyc_claim_for_completion_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 12345,
    created_at: 12_000,
  });

  const proof = engine.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_intent_for_completion_001",
      proof_id: "sim_payment_proof_for_completion_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_for_completion_001",
      currency_code: "INR",
      amount_minor_units: 12345,
      submitted_at: 12_010,
    },
    intent.packet.packet_id
  );

  const acknowledgement = engine.acknowledgePayment(
    {
      payment_intent_id: "sim_payment_intent_for_completion_001",
      proof_id: "sim_payment_proof_for_completion_001",
      acknowledgement_id: "sim_payment_ack_for_completion_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_completion_001",
      status: "received",
      currency_code: "INR",
      amount_minor_units: 12345,
      acknowledged_at: 12_020,
    },
    proof.packet.packet_id
  );

  const fulfillment = engine.startOrderFulfillment(
    {
      order_reference_id: "sim_order_for_completion_001",
      payment_intent_id: "sim_payment_intent_for_completion_001",
      proof_id: "sim_payment_proof_for_completion_001",
      acknowledgement_id: "sim_payment_ack_for_completion_001",
      fulfillment_id: "sim_order_fulfillment_for_completion_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_completion_001",
      started_at: 12_030,
    },
    acknowledgement.packet.packet_id
  );

  const completion = engine.completeOrderFulfillment(
    {
      order_reference_id: "sim_order_for_completion_001",
      payment_intent_id: "sim_payment_intent_for_completion_001",
      proof_id: "sim_payment_proof_for_completion_001",
      acknowledgement_id: "sim_payment_ack_for_completion_001",
      fulfillment_id: "sim_order_fulfillment_for_completion_001",
      completion_id: "sim_order_fulfillment_completion_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_completion_001",
      completed_at: 12_040,
      memo: "vendor completed fulfillment",
    },
    fulfillment.packet.packet_id
  );

  assertSimulation(
    completion.packet.packet_type === "order_fulfillment_completed",
    "Expected order fulfillment completed packet type"
  );

  assertSimulation(
    completion.packet.parent === fulfillment.packet.packet_id,
    "Expected completion packet to point to fulfillment started packet"
  );

  assertSimulation(
    completion.packet.payload.completion_id === "sim_order_fulfillment_completion_001",
    "Expected completion id to be stored"
  );

  assertSimulation(
    completion.packet.payload.completed_at === 12_040,
    "Expected completed_at to be stored"
  );

  assertSimulation(
    engine.packetCount() === 5,
    "Expected payment, fulfillment, and completion flow to store five packets"
  );

  assertSimulation(
    engine.listKnowledge().length === 0,
    "Expected completion packet to be event-only"
  );

  console.log("order fulfillment completed creation passed");

  const importingEngine = new LanguageEngine({
    zone: "order_fulfillment_completed_import_zone",
    author: "order_fulfillment_completed_import_vendor",
    nodeAgeGroup: "adult",
    dbPath: IMPORT_NODE_DB,
  });

  const importResult = importingEngine.importLedgerPackets(engine.exportLedgerPackets());

  assertSimulation(
    importResult.accepted_new_count === 5,
    "Expected imported completion flow to accept five packets"
  );

  assertSimulation(
    importingEngine.packetCount() === 5,
    "Expected imported engine to store five packets"
  );

  console.log("order fulfillment completed ledger import passed");

  const invalidCompletion = createPacket({
    packet_type: "order_fulfillment_completed",
    zone: "order_fulfillment_completed_zone",
    author: "order_fulfillment_completed_vendor",
    payload: {
      order_reference_id: "sim_order_for_invalid_completion_001",
      payment_intent_id: "sim_payment_intent_for_invalid_completion_001",
      proof_id: "sim_payment_proof_for_invalid_completion_001",
      acknowledgement_id: "sim_payment_ack_for_invalid_completion_001",
      fulfillment_id: "sim_order_fulfillment_for_invalid_completion_001",
      completion_id: "sim_order_fulfillment_completion_invalid_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_invalid_completion_001",
      completed_at: 0,
    },
  });

  const invalidImportResult = importingEngine.importLedgerPackets([invalidCompletion]);

  assertSimulation(
    invalidImportResult.rejected_invalid_count === 1,
    "Expected invalid completion packet to be rejected"
  );

  console.log("order fulfillment completed invalid import rejection passed");
  console.log("Order fulfillment completed simulation succeeded.");
}

runSimulation();
