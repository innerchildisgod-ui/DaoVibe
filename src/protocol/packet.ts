import { sha256, stableStringify } from "./hash";
import { PacketType } from "./packetTypes";

export const LMP_VERSION = "lmp/0.1";
export const DEV_SIGNATURE_PREFIX = "dev_signature";

export interface LmpPacket<TPayload = unknown> {
  version: string;
  packet_id: string;
  packet_type: PacketType;
  created_at: number;
  expires_at?: number;
  zone: string;
  author: string;
  parent?: string;
  payload_hash: string;
  payload: TPayload;
  signature: string;
}

export interface CreatePacketArgs<TPayload> {
  packet_type: PacketType;
  zone: string;
  author: string;
  payload: TPayload;
  parent?: string;
  expires_at?: number;
  signature?: string;
}

export function packetHashInput<TPayload>(
  packet: Omit<LmpPacket<TPayload>, "packet_id" | "signature">
) {
  return {
    version: packet.version,
    packet_type: packet.packet_type,
    created_at: packet.created_at,
    expires_at: packet.expires_at,
    zone: packet.zone,
    author: packet.author,
    parent: packet.parent,
    payload_hash: packet.payload_hash,
    payload: packet.payload,
  };
}

export function packetSignatureInput<TPayload>(
  packet: Omit<LmpPacket<TPayload>, "signature">
) {
  return {
    version: packet.version,
    packet_id: packet.packet_id,
    packet_type: packet.packet_type,
    created_at: packet.created_at,
    expires_at: packet.expires_at,
    zone: packet.zone,
    author: packet.author,
    parent: packet.parent,
    payload_hash: packet.payload_hash,
  };
}

export function createDevSignature(author: string, packetId: string): string {
  return `${DEV_SIGNATURE_PREFIX}:${author}:${packetId}`;
}

export function createPacket<TPayload>(
  args: CreatePacketArgs<TPayload>
): LmpPacket<TPayload> {
  const created_at = Math.floor(Date.now() / 1000);
  const payload_hash = sha256(stableStringify(args.payload));

  const base = {
    version: LMP_VERSION,
    packet_type: args.packet_type,
    created_at,
    expires_at: args.expires_at,
    zone: args.zone,
    author: args.author,
    parent: args.parent,
    payload_hash,
    payload: args.payload,
  };

  const packet_id = sha256(stableStringify(base));

  return {
    ...base,
    packet_id,
    signature: args.signature ?? createDevSignature(args.author, packet_id),
  };
}