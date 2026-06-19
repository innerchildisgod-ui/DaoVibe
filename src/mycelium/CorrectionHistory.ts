import type { LmpPacket } from "../protocol/packet";
import type {
  MeaningCorrectionProposedPayload,
  MeaningCorrectionVotePayload,
} from "../protocol/packetTypes";

export type CorrectionHistoryEvent =
  | CorrectionProposedHistoryEvent
  | CorrectionVoteHistoryEvent;

export interface CorrectionProposedHistoryEvent {
  event_type: "correction_proposed";
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  packet_id?: string;
  created_at?: string | number;
}

export interface CorrectionVoteHistoryEvent {
  event_type: "correction_vote";
  phrase_id: string;
  correction_id: string;
  vote: "confirm" | "reject";
  voter?: string;
  packet_id?: string;
  created_at?: string | number;
}

export interface PhraseCorrectionHistoryResult {
  phrase_id: string;
  limit: number;
  history: CorrectionHistoryEvent[];
}

export interface CorrectionHistoryPacketRules {
  isCorrectionProposalForPhrase(
    payload: MeaningCorrectionProposedPayload,
    phraseId: string
  ): boolean;
  isCorrectionVoteForPhrase(
    payload: MeaningCorrectionVotePayload,
    phraseId: string
  ): boolean;
  isNonEmptyString(value: unknown): value is string;
}

interface CorrectionHistoryCandidate {
  event: CorrectionHistoryEvent;
  ledger_index: number;
  timestamp_order?: number;
}

interface CorrectionHistoryMetadata {
  packet_id?: string;
  created_at?: string | number;
}

const DEFAULT_CORRECTION_HISTORY_LIMIT = 100;
const MAX_CORRECTION_HISTORY_LIMIT = 500;

export function clampCorrectionHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CORRECTION_HISTORY_LIMIT;
  }

  return Math.max(
    1,
    Math.min(Math.floor(Number(limit)), MAX_CORRECTION_HISTORY_LIMIT)
  );
}

export function summarizeCorrectionHistoryEventsForPhrase(
  phraseId: string,
  correctionPackets: LmpPacket[],
  limit: number | undefined,
  rules: CorrectionHistoryPacketRules
): CorrectionHistoryEvent[] {
  const normalizedLimit = clampCorrectionHistoryLimit(limit);

  return correctionPackets
    .map((packet, index) =>
      toCorrectionHistoryCandidate(packet, phraseId, index, rules)
    )
    .filter(
      (candidate): candidate is CorrectionHistoryCandidate =>
        candidate !== undefined
    )
    .sort(compareCorrectionHistoryCandidates)
    .slice(0, normalizedLimit)
    .map((candidate) => candidate.event);
}

function toCorrectionHistoryCandidate(
  packet: LmpPacket,
  phraseId: string,
  ledgerIndex: number,
  rules: CorrectionHistoryPacketRules
): CorrectionHistoryCandidate | undefined {
  const event = toCorrectionHistoryEvent(packet, phraseId, rules);

  if (!event) {
    return undefined;
  }

  return {
    event,
    ledger_index: ledgerIndex,
    timestamp_order: packetTimestampOrder(packet),
  };
}

function toCorrectionHistoryEvent(
  packet: LmpPacket,
  phraseId: string,
  rules: CorrectionHistoryPacketRules
): CorrectionHistoryEvent | undefined {
  const metadata = packetHistoryMetadata(packet);

  if (packet.packet_type === "meaning_correction_proposed") {
    const payload = packet.payload as MeaningCorrectionProposedPayload;

    if (!rules.isCorrectionProposalForPhrase(payload, phraseId)) {
      return undefined;
    }

    const event: CorrectionProposedHistoryEvent = {
      event_type: "correction_proposed",
      phrase_id: payload.phrase_id,
      original_meaning_id: payload.original_meaning_id,
      correction_id: payload.correction_id,
      corrected_reference_meaning: payload.corrected_reference_meaning,
      ...metadata,
    };

    if (typeof payload.correction_context === "string") {
      event.correction_context = payload.correction_context;
    }

    if (typeof payload.source === "string") {
      event.source = payload.source;
    }

    return event;
  }

  if (packet.packet_type === "meaning_correction_vote") {
    const payload = packet.payload as MeaningCorrectionVotePayload;

    if (!rules.isCorrectionVoteForPhrase(payload, phraseId)) {
      return undefined;
    }

    const event: CorrectionVoteHistoryEvent = {
      event_type: "correction_vote",
      phrase_id: payload.phrase_id,
      correction_id: payload.correction_id,
      vote: payload.vote,
      ...metadata,
    };

    if (rules.isNonEmptyString(payload.voter)) {
      event.voter = payload.voter.trim();
    }

    return event;
  }

  return undefined;
}

function packetHistoryMetadata(packet: LmpPacket): CorrectionHistoryMetadata {
  const metadata: CorrectionHistoryMetadata = {};

  if (typeof packet.packet_id === "string" && packet.packet_id) {
    metadata.packet_id = packet.packet_id;
  }

  const createdAt = packetCreatedAt(packet);

  if (createdAt !== undefined) {
    metadata.created_at = createdAt;
  }

  return metadata;
}

function packetCreatedAt(packet: LmpPacket): string | number | undefined {
  const createdAt = (packet as { created_at?: unknown }).created_at;

  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt;
  }

  if (typeof createdAt === "string" && createdAt.trim()) {
    return createdAt;
  }

  return undefined;
}

function packetTimestampOrder(packet: LmpPacket): number | undefined {
  const createdAt = packetCreatedAt(packet);

  if (typeof createdAt === "number") {
    return createdAt;
  }

  if (typeof createdAt === "string") {
    const numericCreatedAt = Number(createdAt);

    if (Number.isFinite(numericCreatedAt)) {
      return numericCreatedAt;
    }

    const parsedCreatedAt = Date.parse(createdAt);

    if (Number.isFinite(parsedCreatedAt)) {
      return parsedCreatedAt;
    }
  }

  return undefined;
}

function compareCorrectionHistoryCandidates(
  left: CorrectionHistoryCandidate,
  right: CorrectionHistoryCandidate
): number {
  if (
    left.timestamp_order !== undefined &&
    right.timestamp_order !== undefined &&
    left.timestamp_order !== right.timestamp_order
  ) {
    return left.timestamp_order - right.timestamp_order;
  }

  if (left.ledger_index !== right.ledger_index) {
    return left.ledger_index - right.ledger_index;
  }

  return compareOptionalStrings(left.event.packet_id, right.event.packet_id);
}

function compareOptionalStrings(
  left: string | undefined,
  right: string | undefined
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left.localeCompare(right);
}
