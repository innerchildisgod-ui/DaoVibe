export type PacketMovementDecision =
  | "promote"
  | "filter"
  | "hold"
  | "ask_human";

export interface PacketKernelInput {
  packet_id: string;
  packet_type: string;
  route_decision?: string;
  apply_status?: string;
  errors?: string[];
}

export interface PacketKernelDecision {
  movement: PacketMovementDecision;
  reason: string;
}
