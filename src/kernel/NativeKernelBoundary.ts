import type {
  PacketKernelDecision,
  PacketKernelInput,
} from "./KernelDecisionTypes";

export interface NativeKernelBoundary {
  decidePacketMovement(input: PacketKernelInput): PacketKernelDecision;
}
