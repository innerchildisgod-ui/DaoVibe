export type NativeCoreResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export interface PacketValidationSummary {
  valid: boolean;
  errors: string[];
}

export interface SignatureVerificationSummary {
  verified: boolean;
  reason?: string;
}

export interface LedgerSliceInput {
  packets: unknown[];
}

export interface LedgerSliceVerificationSummary {
  valid: boolean;
  packet_count: number;
  errors: string[];
}

export interface NativePacketCore {
  canonicalizePacket(input: unknown): NativeCoreResult<unknown>;
  hashPayload(input: unknown): NativeCoreResult<string>;
  hashPacket(input: unknown): NativeCoreResult<string>;
  validatePacket(input: unknown): NativeCoreResult<PacketValidationSummary>;
  verifyPacketSignature(
    input: unknown
  ): NativeCoreResult<SignatureVerificationSummary>;
  verifyLedgerSlice(
    input: LedgerSliceInput
  ): NativeCoreResult<LedgerSliceVerificationSummary>;
}

export interface NativeGovernanceCore {
  rankCorrectionCandidates(input: unknown): NativeCoreResult<unknown>;
  rankTombstoneCandidates(input: unknown): NativeCoreResult<unknown>;
}

export interface NativeSyncCore {
  resolveSyncConflict(input: unknown): NativeCoreResult<unknown>;
}

export type MyceliumNativeCore = NativePacketCore &
  NativeGovernanceCore &
  NativeSyncCore;
