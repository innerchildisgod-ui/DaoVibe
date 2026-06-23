import { LmpPacket } from "../protocol/packet";
import {
  PaymentAcknowledgedPayload,
  PaymentIntentCreatedPayload,
  PaymentProofSubmittedPayload,
} from "../protocol/packetTypes";

export type PaymentDerivedStatus =
  | "missing"
  | "intent_created"
  | "proof_submitted"
  | "vendor_received"
  | "vendor_not_received"
  | "vendor_needs_review";

export interface PaymentStatusSummary {
  payment_intent_id: string;
  status: PaymentDerivedStatus;
  intent_packet_id?: string;
  proof_packet_id?: string;
  acknowledgement_packet_id?: string;
  order_reference_id?: string;
  buyer_subject_node_id?: string;
  vendor_subject_node_id?: string;
  buyer_kyc_claim_id?: string;
  vendor_kyc_claim_id?: string;
  proof_id?: string;
  acknowledgement_id?: string;
  external_rail?: string;
  currency_code?: string;
  amount_minor_units?: number;
  acknowledgement_status?: PaymentAcknowledgedPayload["status"];
  reason?: string;
}

function asPayloadObject(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  return payload as Record<string, unknown>;
}

function payloadString(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key];

  return typeof value === "string" ? value : undefined;
}

function payloadNumber(
  payload: Record<string, unknown>,
  key: string
): number | undefined {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function packetSortValue(packet: LmpPacket, payloadTime?: number): string {
  const time = payloadTime ?? packet.created_at;

  return `${String(time).padStart(20, "0")}:${packet.packet_id}`;
}

function newestPacket<TPayload>(
  candidates: Array<{
    packet: LmpPacket;
    payload: TPayload;
    sort_value: string;
  }>
):
  | {
      packet: LmpPacket;
      payload: TPayload;
      sort_value: string;
    }
  | undefined {
  return candidates
    .slice()
    .sort((left, right) => right.sort_value.localeCompare(left.sort_value))[0];
}

function paymentStatusFromAcknowledgement(
  status: PaymentAcknowledgedPayload["status"]
): PaymentDerivedStatus {
  if (status === "received") return "vendor_received";
  if (status === "not_received") return "vendor_not_received";

  return "vendor_needs_review";
}

export function getPaymentStatusSummary(
  packets: LmpPacket[],
  paymentIntentId: string
): PaymentStatusSummary {
  const paymentIntentPackets = packets
    .map((packet) => {
      if (packet.packet_type !== "payment_intent_created") return undefined;

      const payload = asPayloadObject(packet.payload);
      if (!payload) return undefined;

      if (payloadString(payload, "payment_intent_id") !== paymentIntentId) {
        return undefined;
      }

      return {
        packet,
        payload: payload as unknown as PaymentIntentCreatedPayload,
        sort_value: packetSortValue(packet, payloadNumber(payload, "created_at")),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const latestIntent = newestPacket(paymentIntentPackets);

  if (!latestIntent) {
    return {
      payment_intent_id: paymentIntentId,
      status: "missing",
    };
  }

  const paymentProofPackets = packets
    .map((packet) => {
      if (packet.packet_type !== "payment_proof_submitted") return undefined;

      const payload = asPayloadObject(packet.payload);
      if (!payload) return undefined;

      if (payloadString(payload, "payment_intent_id") !== paymentIntentId) {
        return undefined;
      }

      return {
        packet,
        payload: payload as unknown as PaymentProofSubmittedPayload,
        sort_value: packetSortValue(packet, payloadNumber(payload, "submitted_at")),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const latestProof = newestPacket(paymentProofPackets);

  const paymentAcknowledgementPackets = packets
    .map((packet) => {
      if (packet.packet_type !== "payment_acknowledged") return undefined;

      const payload = asPayloadObject(packet.payload);
      if (!payload) return undefined;

      if (payloadString(payload, "payment_intent_id") !== paymentIntentId) {
        return undefined;
      }

      return {
        packet,
        payload: payload as unknown as PaymentAcknowledgedPayload,
        sort_value: packetSortValue(
          packet,
          payloadNumber(payload, "acknowledged_at")
        ),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const latestAcknowledgement = newestPacket(paymentAcknowledgementPackets);

  const status = latestAcknowledgement
    ? paymentStatusFromAcknowledgement(latestAcknowledgement.payload.status)
    : latestProof
      ? "proof_submitted"
      : "intent_created";

  return {
    payment_intent_id: paymentIntentId,
    status,
    intent_packet_id: latestIntent.packet.packet_id,
    proof_packet_id: latestProof?.packet.packet_id,
    acknowledgement_packet_id: latestAcknowledgement?.packet.packet_id,
    order_reference_id: latestIntent.payload.order_reference_id,
    buyer_subject_node_id: latestIntent.payload.buyer_subject_node_id,
    vendor_subject_node_id:
      latestAcknowledgement?.payload.vendor_subject_node_id ??
      latestIntent.payload.vendor_subject_node_id,
    buyer_kyc_claim_id: latestIntent.payload.buyer_kyc_claim_id,
    vendor_kyc_claim_id: latestIntent.payload.vendor_kyc_claim_id,
    proof_id: latestProof?.payload.proof_id,
    acknowledgement_id: latestAcknowledgement?.payload.acknowledgement_id,
    external_rail: latestProof?.payload.external_rail ?? latestIntent.payload.external_rail,
    currency_code:
      latestAcknowledgement?.payload.currency_code ??
      latestProof?.payload.currency_code ??
      latestIntent.payload.currency_code,
    amount_minor_units:
      latestAcknowledgement?.payload.amount_minor_units ??
      latestProof?.payload.amount_minor_units ??
      latestIntent.payload.amount_minor_units,
    acknowledgement_status: latestAcknowledgement?.payload.status,
    reason: latestAcknowledgement?.payload.reason,
  };
}
