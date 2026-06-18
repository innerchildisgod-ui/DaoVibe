import { sha256, stableStringify } from "./hash";
import {
  createDevSignature,
  DEV_SIGNATURE_PREFIX,
  LMP_VERSION,
  LmpPacket,
  packetHashInput,
  packetSignatureInput,
} from "./packet";
import { PacketType } from "./packetTypes";

const SUPPORTED_PACKET_TYPES: Set<PacketType> = new Set([
  "phrase_observed",
  "meaning_proposal",
  "meaning_vote",
  "correction",
  "safety_label",
  "symbol_sample",
]);

export type PacketSignatureStatus =
  | "missing"
  | "dev_signature_valid"
  | "dev_signature_mismatch"
  | "legacy_placeholder"
  | "present_unverified";

export interface PacketValidationResult {
  valid: boolean;
  errors: string[];
  signature_status: PacketSignatureStatus;
  signature_input_hash?: string;
}

export function validatePacket(packet: LmpPacket): PacketValidationResult {
  const errors: string[] = [];
  let signatureStatus: PacketSignatureStatus = "missing";

  if (packet.version !== LMP_VERSION) {
    errors.push(`Unsupported version: ${packet.version}`);
  }

  if (!SUPPORTED_PACKET_TYPES.has(packet.packet_type)) {
    errors.push(`Unsupported packet type: ${packet.packet_type}`);
  }

  if (!packet.packet_id) errors.push("Missing packet_id");
  if (!packet.zone) errors.push("Missing zone");
  if (!packet.author) errors.push("Missing author");

  if (!Number.isInteger(packet.created_at) || packet.created_at <= 0) {
    errors.push("Invalid created_at");
  }

  if (
    packet.expires_at !== undefined &&
    (!Number.isInteger(packet.expires_at) || packet.expires_at <= 0)
  ) {
    errors.push("Invalid expires_at");
  }

  if (!packet.signature) {
    errors.push("Missing signature");
  }

  const expectedPayloadHash = sha256(stableStringify(packet.payload));

  if (packet.payload_hash !== expectedPayloadHash) {
    errors.push("Invalid payload_hash");
  }

  const expectedPacketId = sha256(
    stableStringify(
      packetHashInput({
        version: packet.version,
        packet_type: packet.packet_type,
        created_at: packet.created_at,
        expires_at: packet.expires_at,
        zone: packet.zone,
        author: packet.author,
        parent: packet.parent,
        payload_hash: packet.payload_hash,
        payload: packet.payload,
      })
    )
  );

  if (packet.packet_id !== expectedPacketId) {
    errors.push("Invalid packet_id");
  }

  const signatureInputHash = sha256(stableStringify(packetSignatureInput(packet)));

  if (packet.signature === "dev_signature_placeholder") {
    signatureStatus = "legacy_placeholder";
  } else if (packet.signature) {
    const expectedDevSignature = createDevSignature(
      packet.author,
      packet.packet_id
    );

    if (packet.signature === expectedDevSignature) {
      signatureStatus = "dev_signature_valid";
    } else if (packet.signature.startsWith(`${DEV_SIGNATURE_PREFIX}:`)) {
      signatureStatus = "dev_signature_mismatch";
      errors.push("Invalid dev signature");
    } else {
      signatureStatus = "present_unverified";
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    signature_status: signatureStatus,
    signature_input_hash: signatureInputHash,
  };
}