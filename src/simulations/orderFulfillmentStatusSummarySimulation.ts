import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LanguageEngine } from "../engine";

const NODE_DB = join(
  process.cwd(),
  "data",
  "order_fulfillment_status_summary_node.db"
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
}

function runSimulation(): void {
  resetNodeDb();

  const engine = new LanguageEngine({
    zone: "order_fulfillment_status_summary_zone",
    author: "order_fulfillment_status_summary_vendor",
    nodeAgeGroup: "adult",
    dbPath: NODE_DB,
  });

  const missingSummary = engine.getOrderFulfillmentStatusSummary(
    "sim_order_fulfillment_status_missing"
  );

  assertSimulation(
    missingSummary.status === "missing",
    "Expected missing order fulfillment status"
  );

  assertSimulation(
    engine.packetCount() === 0,
    "Expected missing order fulfillment lookup to be read-only"
  );

  console.log("order fulfillment status missing state passed");

  const intent = engine.createPaymentIntent({
    payment_intent_id: "sim_payment_intent_for_order_status_001",
    order_reference_id: "sim_order_fulfillment_status_001",
    buyer_subject_node_id: "sim_buyer_subject_node_for_order_status_001",
    vendor_subject_node_id: "sim_vendor_subject_node_for_order_status_001",
    buyer_kyc_claim_id: "sim_buyer_kyc_claim_for_order_status_001",
    vendor_kyc_claim_id: "sim_vendor_kyc_claim_for_order_status_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 43210,
    created_at: 10_000,
  });

  const intentSummary = engine.getOrderFulfillmentStatusSummary(
    "sim_order_fulfillment_status_001"
  );

  assertSimulation(
    intentSummary.status === "payment_intent_created",
    "Expected order fulfillment status to derive payment intent state"
  );

  assertSimulation(
    intentSummary.intent_packet_id === intent.packet.packet_id,
    "Expected order fulfillment status to expose intent packet id"
  );

  console.log("order fulfillment status intent state passed");

  const proof = engine.submitPaymentProof(
    {
      payment_intent_id: "sim_payment_intent_for_order_status_001",
      proof_id: "sim_payment_proof_for_order_status_001",
      external_rail: "upi",
      external_reference_hash: "sim_external_payment_reference_hash_for_order_status_001",
      currency_code: "INR",
      amount_minor_units: 43210,
      submitted_at: 10_010,
    },
    intent.packet.packet_id
  );

  const proofSummary = engine.getOrderFulfillmentStatusSummary(
    "sim_order_fulfillment_status_001"
  );

  assertSimulation(
    proofSummary.status === "payment_proof_submitted",
    "Expected order fulfillment status to derive payment proof state"
  );

  assertSimulation(
    proofSummary.proof_packet_id === proof.packet.packet_id,
    "Expected order fulfillment status to expose proof packet id"
  );

  console.log("order fulfillment status proof state passed");

  const acknowledgement = engine.acknowledgePayment(
    {
      payment_intent_id: "sim_payment_intent_for_order_status_001",
      proof_id: "sim_payment_proof_for_order_status_001",
      acknowledgement_id: "sim_payment_ack_for_order_status_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_order_status_001",
      status: "received",
      currency_code: "INR",
      amount_minor_units: 43210,
      acknowledged_at: 10_020,
    },
    proof.packet.packet_id
  );

  const acknowledgementSummary = engine.getOrderFulfillmentStatusSummary(
    "sim_order_fulfillment_status_001"
  );

  assertSimulation(
    acknowledgementSummary.status === "payment_acknowledged",
    "Expected order fulfillment status to derive payment acknowledgement state"
  );

  assertSimulation(
    acknowledgementSummary.acknowledgement_packet_id === acknowledgement.packet.packet_id,
    "Expected order fulfillment status to expose acknowledgement packet id"
  );

  console.log("order fulfillment status acknowledgement state passed");

  const fulfillment = engine.startOrderFulfillment(
    {
      order_reference_id: "sim_order_fulfillment_status_001",
      payment_intent_id: "sim_payment_intent_for_order_status_001",
      proof_id: "sim_payment_proof_for_order_status_001",
      acknowledgement_id: "sim_payment_ack_for_order_status_001",
      fulfillment_id: "sim_order_fulfillment_status_started_001",
      vendor_subject_node_id: "sim_vendor_subject_node_for_order_status_001",
      started_at: 10_030,
      memo: "vendor started fulfillment",
    },
    acknowledgement.packet.packet_id
  );

  const fulfillmentSummary = engine.getOrderFulfillmentStatusSummary(
    "sim_order_fulfillment_status_001"
  );

  assertSimulation(
    fulfillmentSummary.status === "fulfillment_started",
    "Expected order fulfillment status to derive fulfillment started state"
  );

  assertSimulation(
    fulfillmentSummary.fulfillment_packet_id === fulfillment.packet.packet_id,
    "Expected order fulfillment status to expose fulfillment packet id"
  );

  assertSimulation(
    fulfillmentSummary.fulfillment_id === "sim_order_fulfillment_status_started_001",
    "Expected order fulfillment status to expose fulfillment id"
  );

  assertSimulation(
    fulfillmentSummary.fulfilled_started_at === 10_030,
    "Expected order fulfillment status to expose started_at"
  );

  assertSimulation(
    fulfillmentSummary.memo === "vendor started fulfillment",
    "Expected order fulfillment status to expose fulfillment memo"
  );

  assertSimulation(
    engine.packetCount() === 4,
    "Expected full order fulfillment flow to store four packets"
  );

  console.log("order fulfillment status fulfillment state passed");
  console.log("Order fulfillment status summary simulation succeeded.");
}

runSimulation();
