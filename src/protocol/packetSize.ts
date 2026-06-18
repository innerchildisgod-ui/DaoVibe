import { LmpPacket } from "./packet";
import { stableStringify } from "./hash";

export type PacketSizeClass = "tiny" | "small" | "medium" | "large" | "too_large";

export interface PacketSizeEstimate {
  bytes: number;
  sizeClass: PacketSizeClass;
  recommendation: "send_now" | "batch" | "send_header_only" | "reject_or_store_only";
}

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