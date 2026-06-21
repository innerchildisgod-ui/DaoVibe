import type {
  MyceliumNativeCore,
  NativeCoreResult,
} from "./NativeCoreBoundary";

function notImplemented<T>(feature: string): NativeCoreResult<T> {
  return {
    ok: false,
    error: {
      code: "NATIVE_CORE_NOT_IMPLEMENTED",
      message: `${feature} is not implemented in the native core yet.`,
    },
  };
}

export function createTypeScriptNativeCoreStub(): MyceliumNativeCore {
  return {
    canonicalizePacket: () => notImplemented("canonicalizePacket"),
    hashPayload: () => notImplemented("hashPayload"),
    hashPacket: () => notImplemented("hashPacket"),
    validatePacket: () => notImplemented("validatePacket"),
    verifyPacketSignature: () => notImplemented("verifyPacketSignature"),
    verifyLedgerSlice: () => notImplemented("verifyLedgerSlice"),
    rankCorrectionCandidates: () => notImplemented("rankCorrectionCandidates"),
    rankTombstoneCandidates: () => notImplemented("rankTombstoneCandidates"),
    resolveSyncConflict: () => notImplemented("resolveSyncConflict"),
  };
}
