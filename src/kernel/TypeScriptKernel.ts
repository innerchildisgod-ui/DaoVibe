import type { NativeKernelBoundary } from "./NativeKernelBoundary";
import type {
  PacketKernelDecision,
  PacketKernelInput,
} from "./KernelDecisionTypes";

const PROMOTED_APPLY_STATUSES = new Set([
  "applied",
  "applied_to_knowledge",
  "stored_event_only",
]);

export class TypeScriptKernel implements NativeKernelBoundary {
  decidePacketMovement(input: PacketKernelInput): PacketKernelDecision {
    if (
      input.route_decision === "reject_duplicate" ||
      input.apply_status === "already_stored"
    ) {
      return {
        movement: "hold",
        reason: "Packet is already stored.",
      };
    }

    if (input.route_decision === "reject_expired") {
      return {
        movement: "filter",
        reason: "Packet is expired.",
      };
    }

    if (input.route_decision === "reject_invalid") {
      return {
        movement: "filter",
        reason: input.errors?.join("; ") || "Packet is invalid.",
      };
    }

    if (
      input.apply_status &&
      !PROMOTED_APPLY_STATUSES.has(input.apply_status)
    ) {
      return {
        movement: "filter",
        reason: `Packet failed apply status: ${input.apply_status}`,
      };
    }

    return {
      movement: "promote",
      reason: "Packet is valid and useful for sync.",
    };
  }
}
