import { LmpPacket } from "./packet";
import { validatePacket } from "./validatePacket";
import { PacketIndex } from "./packetIndex";

export type PacketRouteDecision =
  | "accept_new"
  | "reject_duplicate"
  | "reject_invalid"
  | "reject_expired";

export interface PacketRouteResult {
  decision: PacketRouteDecision;
  packet_id?: string;
  errors: string[];
}

export class PacketRouter {
  constructor(private readonly index: PacketIndex) {}

  routeIncoming(packet: LmpPacket): PacketRouteResult {
    const validation = validatePacket(packet);

    if (!validation.valid) {
      return {
        decision: "reject_invalid",
        packet_id: packet.packet_id,
        errors: validation.errors,
      };
    }

    if (packet.expires_at && packet.expires_at < Math.floor(Date.now() / 1000)) {
      return {
        decision: "reject_expired",
        packet_id: packet.packet_id,
        errors: ["Packet expired"],
      };
    }

    if (this.index.has(packet.packet_id)) {
      return {
        decision: "reject_duplicate",
        packet_id: packet.packet_id,
        errors: ["Packet already exists in local index"],
      };
    }

    this.index.add(packet);

    return {
      decision: "accept_new",
      packet_id: packet.packet_id,
      errors: [],
    };
  }
}