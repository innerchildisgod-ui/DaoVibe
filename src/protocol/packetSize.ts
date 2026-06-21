import { LmpPacket } from "./packet";
import { stableStringify } from "./hash";

export type PacketSizeClass = "tiny" | "small" | "medium" | "large" | "too_large";

export interface PacketSizeEstimate {
  bytes: number;
  sizeClass: PacketSizeClass;
  recommendation: "send_now" | "batch" | "send_header_only" | "reject_or_store_only";
}

export interface PacketBatchSizeEstimate {
  packetCount: number;
  bytes: number;
}

export const MAX_SYNC_BATCH_PACKETS = 50;
export const MAX_SYNC_BATCH_BYTES = 64 * 1024;

export function estimatePacketSize(packet: LmpPacket): PacketSizeEstimate {
  const encoded = Buffer.from(stableStringify(packet), "utf8");
  const bytes = encoded.length;

  if (bytes <= 512) {
    return {
      bytes,
      sizeClass: "tiny",
      recommendation: "send_now",
    };
  }

  if (bytes <= 2048) {
    return {
      bytes,
      sizeClass: "small",
      recommendation: "send_now",
    };
  }

  if (bytes <= 8192) {
    return {
      bytes,
      sizeClass: "medium",
      recommendation: "batch",
    };
  }

  if (bytes <= 32768) {
    return {
      bytes,
      sizeClass: "large",
      recommendation: "send_header_only",
    };
  }

  return {
    bytes,
    sizeClass: "too_large",
    recommendation: "reject_or_store_only",
  };
}

export function estimatePacketBatchSize(
  packets: LmpPacket[]
): PacketBatchSizeEstimate {
  return {
    packetCount: packets.length,
    bytes: Buffer.from(stableStringify(packets), "utf8").length,
  };
}

export function clampSyncBatchLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return MAX_SYNC_BATCH_PACKETS;
  }

  return Math.max(
    1,
    Math.min(Math.floor(Number(limit)), MAX_SYNC_BATCH_PACKETS)
  );
}

export function assertSyncBatchWithinLimits(packets: LmpPacket[]): void {
  const estimate = estimatePacketBatchSize(packets);

  if (estimate.packetCount > MAX_SYNC_BATCH_PACKETS) {
    throw new Error(
      `Sync batch size limit exceeded: ${estimate.packetCount} packets exceeds maximum ${MAX_SYNC_BATCH_PACKETS}`
    );
  }

  if (estimate.bytes > MAX_SYNC_BATCH_BYTES) {
    throw new Error(
      `Sync batch size limit exceeded: ${estimate.bytes} bytes exceeds maximum ${MAX_SYNC_BATCH_BYTES}`
    );
  }
}
