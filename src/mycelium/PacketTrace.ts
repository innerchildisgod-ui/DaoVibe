import type { LmpPacket } from "../protocol/packet";
import type { PacketType } from "../protocol/packetTypes";
import type { PhraseLookupSource } from "./PhraseLookup";

export type PhrasePacketTraceRole =
  | "phrase_observation"
  | "meaning_proposal"
  | "meaning_vote"
  | "safety_label"
  | "correction_proposal"
  | "correction_vote"
  | "tombstone_proposal"
  | "tombstone_vote"
  | "unknown";

export interface PhrasePacketTraceEntry {
  packet_id: string;
  packet_type: string;
  author?: string;
  parent?: string;
  phrase_id?: string;
  meaning_id?: string;
  correction_id?: string;
  tombstone_id?: string;
  created_at?: number | string;
  received_at?: number;
  role: PhrasePacketTraceRole;
  summary: string;
}

export interface PhrasePacketTraceResult {
  phrase_id: string;
  trace: {
    packet_count: number;
    packet_types: Record<string, number>;
    packets: PhrasePacketTraceEntry[];
  };
  safety: {
    tombstone_execution: false;
    deletion_enabled: false;
    ledger_pruning_enabled: false;
  };
}

const PHRASE_PACKET_TRACE_TYPES: PacketType[] = [
  "phrase_observed",
  "meaning_proposal",
  "meaning_vote",
  "safety_label",
  "meaning_correction_proposed",
  "meaning_correction_vote",
  "meaning_correction_tombstone_proposed",
  "meaning_correction_tombstone_vote",
  "symbol_sample",
];

export function getPacketTraceForPhrase(
  source: PhraseLookupSource,
  phraseId: string
): PhrasePacketTraceResult {
  const normalizedPhraseId = phraseId.trim();
  const packets =
    source.listPacketsForPhraseByTypes?.(
      normalizedPhraseId,
      PHRASE_PACKET_TRACE_TYPES
    ) ??
    source.listPacketsByPhraseAndTypes?.(
      normalizedPhraseId,
      PHRASE_PACKET_TRACE_TYPES
    ) ??
    [];
  const tracePackets = packets.map(toTraceEntry);

  return {
    phrase_id: normalizedPhraseId,
    trace: {
      packet_count: tracePackets.length,
      packet_types: countPacketTypes(tracePackets),
      packets: tracePackets,
    },
    safety: {
      tombstone_execution: false,
      deletion_enabled: false,
      ledger_pruning_enabled: false,
    },
  };
}

function countPacketTypes(
  packets: PhrasePacketTraceEntry[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const packet of packets) {
    counts[packet.packet_type] = (counts[packet.packet_type] ?? 0) + 1;
  }

  return counts;
}

function toTraceEntry(packet: LmpPacket): PhrasePacketTraceEntry {
  const payload = asRecord(packet.payload);
  const entry: PhrasePacketTraceEntry = {
    packet_id: packet.packet_id,
    packet_type: packet.packet_type,
    author: packet.author,
    parent: packet.parent,
    phrase_id: stringField(payload, "phrase_id"),
    meaning_id: stringField(payload, "meaning_id"),
    correction_id: stringField(payload, "correction_id"),
    tombstone_id: stringField(payload, "tombstone_id"),
    created_at: packet.created_at,
    role: roleForPacketType(packet.packet_type),
    summary: summaryForPacket(packet.packet_type, payload),
  };

  return entry;
}

function roleForPacketType(packetType: PacketType): PhrasePacketTraceRole {
  switch (packetType) {
    case "phrase_observed":
      return "phrase_observation";
    case "meaning_proposal":
      return "meaning_proposal";
    case "meaning_vote":
      return "meaning_vote";
    case "safety_label":
      return "safety_label";
    case "meaning_correction_proposed":
      return "correction_proposal";
    case "meaning_correction_vote":
      return "correction_vote";
    case "meaning_correction_tombstone_proposed":
      return "tombstone_proposal";
    case "meaning_correction_tombstone_vote":
      return "tombstone_vote";
    default:
      return "unknown";
  }
}

function summaryForPacket(
  packetType: PacketType,
  payload: Record<string, unknown>
): string {
  switch (packetType) {
    case "phrase_observed":
      return `Observed phrase ${label(stringField(payload, "phrase_id"))} with surface ${label(
        stringField(payload, "surface_text")
      )}.`;
    case "meaning_proposal":
      return `Proposed meaning ${label(
        stringField(payload, "meaning_id")
      )}: ${label(stringField(payload, "reference_meaning"))}.`;
    case "meaning_vote":
      return `Voted ${label(stringField(payload, "vote"))} on meaning ${label(
        stringField(payload, "meaning_id")
      )}.`;
    case "safety_label":
      return `Applied safety label ${label(stringField(payload, "label"))}.`;
    case "meaning_correction_proposed":
      return `Proposed correction ${label(
        stringField(payload, "correction_id")
      )} for meaning ${label(stringField(payload, "original_meaning_id"))}.`;
    case "meaning_correction_vote":
      return `Voted ${label(
        stringField(payload, "vote")
      )} on correction ${label(stringField(payload, "correction_id"))}.`;
    case "meaning_correction_tombstone_proposed":
      return `Proposed tombstone ${label(
        stringField(payload, "tombstone_id")
      )} for correction ${label(stringField(payload, "correction_id"))}.`;
    case "meaning_correction_tombstone_vote":
      return `Voted ${label(
        stringField(payload, "vote")
      )} on tombstone ${label(stringField(payload, "tombstone_id"))}.`;
    default:
      return `Packet ${packetType} is associated with this phrase.`;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string
): string | undefined {
  const value = record[fieldName];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function label(value: string | undefined): string {
  return value ?? "unknown";
}
