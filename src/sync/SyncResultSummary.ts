export type SyncPacketStatus =
  | "accepted_new"
  | "already_stored"
  | "rejected_invalid"
  | "rejected_expired"
  | "failed_apply";

export interface SyncPacketResult {
  packet_id: string;
  packet_type: string;
  status: SyncPacketStatus;
  apply_status?: string;
  reason?: string;
}

export interface SyncResultSummary {
  accepted_new: number;
  already_stored: number;
  rejected_invalid: number;
  rejected_expired: number;
  failed_apply: number;
}

export interface DetailedSyncImportResult {
  peer_author: string;
  cursor_before: string;
  cursor_after: string;
  packet_count: number;
  imported_count: number;
  failed_count: number;
  summary: SyncResultSummary;
  results: SyncPacketResult[];
}

export function createEmptySyncResultSummary(): SyncResultSummary {
  return {
    accepted_new: 0,
    already_stored: 0,
    rejected_invalid: 0,
    rejected_expired: 0,
    failed_apply: 0,
  };
}

export function incrementSyncResultSummary(
  summary: SyncResultSummary,
  status: SyncPacketStatus
): void {
  summary[status] += 1;
}

export function summarizeSyncPacketResults(
  results: SyncPacketResult[]
): SyncResultSummary {
  const summary = createEmptySyncResultSummary();

  for (const result of results) {
    incrementSyncResultSummary(summary, result.status);
  }

  return summary;
}
