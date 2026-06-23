import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LanguageEngine } from "../engine";
import { createPacket } from "../protocol/packet";

const NODE_DB = join(process.cwd(), "data", "order_fulfillment_started_node.db");
const IMPORT_NODE_DB = join(
  process.cwd(),
  "data",
  "order_fulfillment_started_import_node.db"
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
    zone: "order_fulfillment_started_zone",
    author: "order_fulfillment_started_vendor",
    nodeAgeGroup: "adult",
    dbPath: NODE_DB,
  });

  const intent = engine.createPaymentIntent({
    payment_intent_id: "sim_payment_intent_for_fulfillment_001",
    order_reference_id: "sim_order_for_fulfillment_001",
    buyer_subject_node_id: "sim_buyer_subject_node_for_fulfillment_001",
    vendor_subject_node_id: "sim_vendor_subject_node_for_fulfillment_001",
    buyer_kyc_claim_id: "sim_buyer_kyc_claim_for_fulfillment_001",
    vendor_kyc_claim_id: "sim_vendor_kyc_claim_for_fulfillment_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 12345,
    created_at: 9_000,
  });

  const proof = engine.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_intent_for_fulfillment_001",
      proof_id: "sim_payment_proof_for_fulfillment_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_for_fulfillment_001",
      currency_code: "INR",
      amount_minor_units: 12345,
      submitted_at: 9_010,
    },
    intent.packet.packet_id
  );

  const acknowledgement = engine.acknowledgePayment(
    {
      payment_intent_id: "sim_payment_intent_for_fulfillment_001",
      proof_id: "sim_payment_proof_for_fulfillment_001",
      acknowledgement_id: "sim_payment_ack_for_fulfillment_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_fulfillment_001",
      status: "received",
      currency_code: "INR",
      amount_minor_units: 12345,
      acknowledged_at: 9_020,
    },
    proof.packet.packet_id
  );

  const fulfillment = engine.startOrderFulfillment(
    {
      order_reference_id: "sim_order_for_fulfillment_001",
      payment_intent_id: "sim_payment_intent_for_fulfillment_001",
      proof_id: "sim_payment_proof_for_fulfillment_001",
      acknowledgement_id: "sim_payment_ack_for_fulfillment_001",
      fulfillment_id: "sim_order_fulfillment_started_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_fulfillment_001",
      started_at: 9_030,
      memo: "vendor started fulfillment",
    },
    acknowledgement.packet.packet_id
  );

  assertSimulation(
    fulfillment.packet.packet_type === "order_fulfillment_started",
    "Expected order fulfillment started packet type"
  );

  assertSimulation(
    fulfillment.packet.parent === acknowledgement.packet.packet_id,
    "Expected fulfillment packet to point to acknowledgement packet"
  );

  assertSimulation(
    fulfillment.packet.payload.fulfillment_id === "sim_order_fulfillment_started_001",
    "Expected fulfillment id to be stored"
  );

  assertSimulation(
    engine.packetCount() === 4,
    "Expected payment and fulfillment flow to store four packets"
  );

  assertSimulation(
    engine.listKnowledge().length === 0,
    "Expected fulfillment packet to be event-only"
  );

  console.log("order fulfillment started creation passed");

  const importingEngine = new LanguageEngine({
    zone: "order_fulfillment_started_import_zone",
    author: "order_fulfillment_started_import_vendor",
    nodeAgeGroup: "adult",
    dbPath: IMPORT_NODE_DB,
  });

  const importResult = importingEngine.importLedgerPackets(engine.exportLedgerPackets());

  assertSimulation(
    importResult.accepted_new_count === 4,
    "Expected imported fulfillment flow to accept four packets"
  );

  assertSimulation(
    importingEngine.packetCount() === 4,
    "Expected imported engine to store four packets"
  );

  console.log("order fulfillment started ledger import passed");

  const invalidFulfillment = createPacket({
    packet_type: "order_fulfillment_started",
    zone: "order_fulfillment_started_zone",
    author: "order_fulfillment_started_vendor",
    payload: {
      order_reference_id: "sim_order_for_invalid_fulfillment_001",
      payment_intent_id: "sim_payment_intent_for_invalid_fulfillment_001",
      proof_id: "sim_payment_proof_for_invalid_fulfillment_001",
      acknowledgement_id: "sim_payment_ack_for_invalid_fulfillment_001",
      fulfillment_id: "sim_order_fulfillment_invalid_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_invalid_fulfillment_001",
      started_at: 0,
    },
  });

  const invalidImportResult = importingEngine.importLedgerPackets([invalidFulfillment]);

  assertSimulation(
    invalidImportResult.rejected_invalid_count === 1,
    "Expected invalid fulfillment packet to be rejected"
  );

  console.log("order fulfillment started invalid import rejection passed");
  console.log("Order fulfillment started simulation succeeded.");
}

runSimulation();
