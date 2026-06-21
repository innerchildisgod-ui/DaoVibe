import type { LanguageEngine, ReceivePacketResult } from "../engine";
import type { NativeKernelBoundary } from "../kernel/NativeKernelBoundary";
import { TypeScriptKernel } from "../kernel/TypeScriptKernel";
import type { LmpPacket } from "../protocol/packet";
import {
  assertSyncBatchWithinLimits,
  clampSyncBatchLimit,
} from "../protocol/packetSize";
import { requestJson } from "../server/http/requestJson";
import {
  DetailedSyncImportResult,
  SyncPacketResult,
  SyncPacketStatus,
  summarizeSyncPacketResults,
} from "./SyncResultSummary";

interface RemoteSyncPullResponse {
  ok: boolean;
  zone: string;
  from_author: string;
  cursor_before: string;
  cursor_after: string;
  packet_count: number;
  packets: LmpPacket[];
  error?: string;
}

export interface SyncRunResult {
  remote_base_url: string;
  peer_author: string;
  saved_cursor_before: string;
  result: DetailedSyncImportResult;
}

interface SyncControllerEngine {
  getPeerSyncCursor: LanguageEngine["getPeerSyncCursor"];
  setPeerSyncCursor: LanguageEngine["setPeerSyncCursor"];
  receivePacket: LanguageEngine["receivePacket"];
  pullSyncBatch: LanguageEngine["pullSyncBatch"];
  getPacketsByIds: LanguageEngine["getPacketsByIds"];
  findMissingPacketIds: LanguageEngine["findMissingPacketIds"];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function classifySyncImportFailure(error: unknown): SyncPacketStatus {
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (message.includes("reject_expired") || lowerMessage.includes("expired")) {
    return "rejected_expired";
  }

  if (
    message.includes("reject_invalid") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("unsupported") ||
    lowerMessage.includes("missing")
  ) {
    return "rejected_invalid";
  }

  return "failed_apply";
}

function normalizeRemoteBaseUrl(remoteBaseUrl: string): string {
  return remoteBaseUrl.replace(/\/+$/, "");
}

function buildSyncPullUrl(
  remoteBaseUrl: string,
  cursor: string,
  limit: number
): string {
  const baseUrl = normalizeRemoteBaseUrl(remoteBaseUrl);
  const encodedCursor = encodeURIComponent(cursor);

  return `${baseUrl}/sync/pull?cursor=${encodedCursor}&limit=${limit}`;
}

function packetField(packet: unknown, field: "packet_id" | "packet_type") {
  const value =
    packet !== null && typeof packet === "object"
      ? (packet as Partial<LmpPacket>)[field]
      : undefined;

  return typeof value === "string" && value ? value : "(missing)";
}

export class SyncController {
  constructor(
    private readonly engine: SyncControllerEngine,
    private readonly kernel: NativeKernelBoundary = new TypeScriptKernel()
  ) {}

  pullBatch(cursor = "0:", limit = 100) {
    return this.engine.pullSyncBatch(cursor, clampSyncBatchLimit(limit));
  }

  getPeerSyncCursor(peerAuthor: string) {
    return this.engine.getPeerSyncCursor(peerAuthor);
  }

  setPeerSyncCursor(peerAuthor: string, cursor: string) {
    return this.engine.setPeerSyncCursor(peerAuthor, cursor);
  }

  getPacketsByIds(packetIds: string[]) {
    return this.engine.getPacketsByIds(packetIds);
  }

  findMissingPacketIds(packetIds: string[]): string[] {
    return this.engine.findMissingPacketIds(packetIds);
  }

  importBatch(params: {
    peerAuthor: string;
    cursorBefore: string;
    cursorAfter: string;
    packets: LmpPacket[];
  }): DetailedSyncImportResult {
    const currentCursor = this.engine.getPeerSyncCursor(params.peerAuthor);

    if (currentCursor.cursor !== params.cursorBefore) {
      throw new Error(
        [
          `Sync import failed for ${params.peerAuthor}.`,
          `Packet index: none.`,
          `Packet ID: not available.`,
          `Packet type: not available.`,
          `Cursor was not advanced.`,
          `Reason: Sync cursor mismatch. Expected ${currentCursor.cursor}, received ${params.cursorBefore}`,
        ].join(" ")
      );
    }

    try {
      assertSyncBatchWithinLimits(params.packets);
    } catch (error) {
      throw new Error(
        [
          `Sync import failed for ${params.peerAuthor}.`,
          `Packet index: none.`,
          `Packet ID: not available.`,
          `Packet type: not available.`,
          `Cursor was not advanced.`,
          `Reason: ${getErrorMessage(error)}`,
        ].join(" ")
      );
    }

    const results: SyncPacketResult[] = [];

    for (let index = 0; index < params.packets.length; index += 1) {
      const packet = params.packets[index];

      try {
        const receiveResult = this.engine.receivePacket(packet);

        results.push(this.describeReceiveResult(receiveResult));
      } catch (error) {
        const status = classifySyncImportFailure(error);
        const errorMessage = getErrorMessage(error);

        results.push({
          packet_id: packetField(packet, "packet_id"),
          packet_type: packetField(packet, "packet_type"),
          status,
          reason: errorMessage,
        });

        const summary = summarizeSyncPacketResults(results);

        throw new Error(
          [
            `Sync import failed for ${params.peerAuthor}.`,
            `Packet index: ${index}.`,
            `Packet ID: ${packetField(packet, "packet_id")}.`,
            `Packet type: ${packetField(packet, "packet_type")}.`,
            `Status: ${status}.`,
            `Cursor was not advanced.`,
            `Summary: ${JSON.stringify(summary)}.`,
            `Reason: ${errorMessage}`,
          ].join(" ")
        );
      }
    }

    const summary = summarizeSyncPacketResults(results);
    let cursor: ReturnType<SyncControllerEngine["setPeerSyncCursor"]>;

    try {
      cursor = this.engine.setPeerSyncCursor(
        params.peerAuthor,
        params.cursorAfter
      );
    } catch (error) {
      throw new Error(
        [
          `Sync import failed for ${params.peerAuthor}.`,
          `Packet index: none.`,
          `Packet ID: not available.`,
          `Packet type: not available.`,
          `Cursor was not advanced.`,
          `Summary: ${JSON.stringify(summary)}.`,
          `Reason: ${getErrorMessage(error)}`,
        ].join(" ")
      );
    }

    return {
      peer_author: params.peerAuthor,
      cursor_before: params.cursorBefore,
      cursor_after: cursor.cursor,
      packet_count: params.packets.length,
      imported_count: summary.accepted_new + summary.already_stored,
      failed_count:
        summary.rejected_invalid +
        summary.rejected_expired +
        summary.failed_apply,
      summary,
      results,
    };
  }

  async runFromRemote(params: {
    remoteBaseUrl: string;
    peerAuthor: string;
    limit: number;
  }): Promise<SyncRunResult> {
    const savedCursor = this.engine.getPeerSyncCursor(params.peerAuthor);
    const normalizedRemoteBaseUrl = normalizeRemoteBaseUrl(params.remoteBaseUrl);
    const limit = clampSyncBatchLimit(params.limit);
    const pullUrl = buildSyncPullUrl(
      normalizedRemoteBaseUrl,
      savedCursor.cursor,
      limit
    );
    const pulledBatch = await requestJson<RemoteSyncPullResponse>(
      "GET",
      pullUrl
    );

    if (!pulledBatch.ok) {
      throw new Error(pulledBatch.error ?? "Remote sync pull failed");
    }

    if (pulledBatch.from_author !== params.peerAuthor) {
      throw new Error(
        `Remote author mismatch. Expected ${params.peerAuthor}, received ${pulledBatch.from_author}`
      );
    }

    return {
      remote_base_url: normalizedRemoteBaseUrl,
      peer_author: params.peerAuthor,
      saved_cursor_before: savedCursor.cursor,
      result: this.importBatch({
        peerAuthor: params.peerAuthor,
        cursorBefore: pulledBatch.cursor_before,
        cursorAfter: pulledBatch.cursor_after,
        packets: pulledBatch.packets,
      }),
    };
  }

  private describeReceiveResult(
    receiveResult: ReceivePacketResult
  ): SyncPacketResult {
    const decision = this.kernel.decidePacketMovement({
      packet_id: receiveResult.packet.packet_id,
      packet_type: receiveResult.packet.packet_type,
      route_decision: receiveResult.packetRoute.decision,
      apply_status: receiveResult.applyStatus,
      errors: receiveResult.packetRoute.errors,
    });
    const status = this.mapDecisionToStatus(receiveResult, decision.movement);
    const routeReason =
      receiveResult.packetRoute.errors.length > 0
        ? receiveResult.packetRoute.errors.join(", ")
        : undefined;

    return {
      packet_id: receiveResult.packet.packet_id,
      packet_type: receiveResult.packet.packet_type,
      status,
      apply_status: receiveResult.applyStatus,
      reason:
        routeReason ?? (status === "accepted_new" ? undefined : decision.reason),
    };
  }

  private mapDecisionToStatus(
    receiveResult: ReceivePacketResult,
    movement: ReturnType<NativeKernelBoundary["decidePacketMovement"]>["movement"]
  ): SyncPacketStatus {
    if (
      movement === "hold" ||
      receiveResult.applyStatus === "already_stored"
    ) {
      return "already_stored";
    }

    if (movement === "promote") {
      return "accepted_new";
    }

    if (receiveResult.packetRoute.decision === "reject_expired") {
      return "rejected_expired";
    }

    if (receiveResult.packetRoute.decision === "reject_invalid") {
      return "rejected_invalid";
    }

    return "failed_apply";
  }
}
