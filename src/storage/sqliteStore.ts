import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { LmpPacket } from "../protocol/packet";
import { PacketSizeEstimate } from "../protocol/packetSize";
import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PacketType,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "../protocol/packetTypes";
import { MeaningRecord } from "../knowledge/phraseStore";
import { SafetyLabel } from "../safety/safetyLabels";
import {
  listAppliedSchemaMigrations,
  runSqliteMigrations,
  type AppliedSchemaMigration,
} from "./sqliteMigrations";

interface PacketRefs {
  phrase_id?: string;
  meaning_id?: string;
  symbol_id?: string;
}

interface PhraseRow {
  phrase_id: string;
  surface_text: string | null;
  phonetic_hint: string | null;
  language_hint: string | null;
  safety_label: SafetyLabel;
}

interface MeaningRow {
  meaning_id: string;
  phrase_id: string;
  reference_meaning: string;
  context: string | null;
  confidence: number;
  confirms: number;
  rejects: number;
}

export interface KnowledgeMeaningRecord {
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  confirms: number;
  rejects: number;
}

export interface KnowledgePhraseRecord {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label: SafetyLabel;
  meanings: KnowledgeMeaningRecord[];
}

export interface PacketSummary {
  packet_id: string;
  packet_type: string;
  zone: string;
  author: string;
  parent?: string;
  phrase_id?: string;
  meaning_id?: string;
  symbol_id?: string;
  payload_hash: string;
  packet_size_bytes: number;
  packet_size_class: string;
  size_recommendation: string;
  created_at: number;
  received_at: number;
}

export interface PacketSyncBatch {
  cursor_before: string;
  cursor_after: string;
  packet_count: number;
  packets: LmpPacket[];
}

export interface PeerSyncCursor {
  peer_author: string;
  cursor: string;
  updated_at: number;
}

export interface LocalNodeIdentity {
  node_id: string;
  display_name: string;
  default_author: string;
  created_at: number;
  updated_at: number;
}

export interface LocalNodeSettings {
  default_language_hint: string;
  default_safety_label: SafetyLabel;
  sync_mode: "manual";
  developer_mode: boolean;
  show_debug_panels: boolean;
  updated_at: number;
}

export interface LocalNodeSettingsUpdate {
  default_language_hint?: string;
  default_safety_label?: SafetyLabel;
  sync_mode?: "manual";
  developer_mode?: boolean;
  show_debug_panels?: boolean;
}

interface PacketRow extends PacketSummary {
  packet_json: string;
}

interface LocalNodeIdentityRow extends LocalNodeIdentity {
  id: number;
}

interface LocalNodeSettingsRow {
  id: number;
  default_language_hint: string;
  default_safety_label: SafetyLabel;
  sync_mode: string;
  developer_mode: number;
  show_debug_panels: number;
  updated_at: number;
}

interface SyncPacketRow {
  packet_id: string;
  received_at: number;
  packet_json: string;
}

interface SyncCursor {
  received_at: number;
  packet_id: string;
}

function decodeSyncCursor(cursor?: string): SyncCursor {
  const value = cursor ?? "0:";
  const separatorIndex = value.indexOf(":");

  if (separatorIndex === -1) {
    throw new Error(`Invalid sync cursor: ${value}`);
  }

  const receivedAtText = value.slice(0, separatorIndex);
  const packetId = value.slice(separatorIndex + 1);
  const receivedAt = Number(receivedAtText);

  if (!Number.isInteger(receivedAt) || receivedAt < 0) {
    throw new Error(`Invalid sync cursor timestamp: ${receivedAtText}`);
  }

  return {
    received_at: receivedAt,
    packet_id: packetId,
  };
}

function encodeSyncCursor(receivedAt: number, packetId: string): string {
  return `${receivedAt}:${packetId}`;
}
function compareSyncCursors(left: string, right: string): number {
  const leftCursor = decodeSyncCursor(left);
  const rightCursor = decodeSyncCursor(right);

  if (leftCursor.received_at > rightCursor.received_at) {
    return 1;
  }

  if (leftCursor.received_at < rightCursor.received_at) {
    return -1;
  }

  if (leftCursor.packet_id > rightCursor.packet_id) {
    return 1;
  }

  if (leftCursor.packet_id < rightCursor.packet_id) {
    return -1;
  }

  return 0;
}

function clampSyncLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(Math.floor(limit), 500));
}

function clampLookupLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return 25;
  }

  return Math.max(1, Math.min(Math.floor(Number(limit)), 100));
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function createLocalNodeId(): string {
  return `mycelium_node_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

const DEFAULT_LOCAL_NODE_SETTINGS: Omit<LocalNodeSettings, "updated_at"> = {
  default_language_hint: "und",
  default_safety_label: "normal",
  sync_mode: "manual",
  developer_mode: true,
  show_debug_panels: true,
};

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function extractRefs(packet: LmpPacket): PacketRefs {
  const payload = packet.payload as Record<string, unknown>;

  return {
    phrase_id:
      typeof payload.phrase_id === "string" ? payload.phrase_id : undefined,
    meaning_id:
      typeof payload.meaning_id === "string" ? payload.meaning_id : undefined,
    symbol_id:
      typeof payload.symbol_id === "string" ? payload.symbol_id : undefined,
  };
}

function toLocalNodeIdentity(row: LocalNodeIdentityRow): LocalNodeIdentity {
  return {
    node_id: row.node_id,
    display_name: row.display_name,
    default_author: row.default_author,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toLocalNodeSettings(row: LocalNodeSettingsRow): LocalNodeSettings {
  if (row.sync_mode !== "manual") {
    throw new Error(`Unsupported local settings sync_mode: ${row.sync_mode}`);
  }

  return {
    default_language_hint: row.default_language_hint,
    default_safety_label: row.default_safety_label,
    sync_mode: "manual",
    developer_mode: row.developer_mode === 1,
    show_debug_panels: row.show_debug_panels === 1,
    updated_at: row.updated_at,
  };
}

function booleanToSqliteInteger(value: boolean): number {
  return value ? 1 : 0;
}

export class SQLiteStore {
  private db: Database.Database;

  constructor(
    dbPath = path.join(process.cwd(), "data", "callsab_language_engine.db")
  ) {
    const dir = path.dirname(dbPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.initialize();
  }

  private initialize(): void {
    runSqliteMigrations(this.db);
  }

  listAppliedSchemaMigrations(): AppliedSchemaMigration[] {
    return listAppliedSchemaMigrations(this.db);
  }

  getOrCreateLocalNodeIdentity(): LocalNodeIdentity {
    const existingIdentity = this.getLocalNodeIdentityRow();

    if (existingIdentity) {
      return toLocalNodeIdentity(existingIdentity);
    }

    const createdAt = currentUnixSeconds();
    const nodeId = createLocalNodeId();

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO local_node_identity (
          id,
          node_id,
          display_name,
          default_author,
          created_at,
          updated_at
        )
        VALUES (
          1,
          @node_id,
          @display_name,
          @default_author,
          @created_at,
          @updated_at
        )
      `
      )
      .run({
        node_id: nodeId,
        display_name: "Local Mycelium Node",
        default_author: nodeId,
        created_at: createdAt,
        updated_at: createdAt,
      });

    const identity = this.getLocalNodeIdentityRow();

    if (!identity) {
      throw new Error("Failed to create local node identity");
    }

    return toLocalNodeIdentity(identity);
  }

  updateLocalNodeIdentity(input: {
    display_name?: string;
    default_author?: string;
  }): LocalNodeIdentity {
    const existingIdentity = this.getOrCreateLocalNodeIdentity();
    const displayName = input.display_name?.trim();
    const defaultAuthor = input.default_author?.trim();

    if (displayName === undefined && defaultAuthor === undefined) {
      throw new Error("display_name or default_author is required");
    }

    if (input.display_name !== undefined && !displayName) {
      throw new Error("display_name must be a non-empty string");
    }

    if (input.default_author !== undefined && !defaultAuthor) {
      throw new Error("default_author must be a non-empty string");
    }

    const updatedAt = Math.max(
      currentUnixSeconds(),
      existingIdentity.updated_at + 1
    );

    this.db
      .prepare(
        `
        UPDATE local_node_identity
        SET
          display_name = @display_name,
          default_author = @default_author,
          updated_at = @updated_at
        WHERE id = 1
      `
      )
      .run({
        display_name: displayName ?? existingIdentity.display_name,
        default_author: defaultAuthor ?? existingIdentity.default_author,
        updated_at: updatedAt,
      });

    const updatedIdentity = this.getLocalNodeIdentityRow();

    if (!updatedIdentity) {
      throw new Error("Failed to update local node identity");
    }

    return toLocalNodeIdentity(updatedIdentity);
  }

  getOrCreateLocalNodeSettings(): LocalNodeSettings {
    const existingSettings = this.getLocalNodeSettingsRow();

    if (existingSettings) {
      return toLocalNodeSettings(existingSettings);
    }

    const updatedAt = currentUnixSeconds();

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO local_node_settings (
          id,
          default_language_hint,
          default_safety_label,
          sync_mode,
          developer_mode,
          show_debug_panels,
          updated_at
        )
        VALUES (
          1,
          @default_language_hint,
          @default_safety_label,
          @sync_mode,
          @developer_mode,
          @show_debug_panels,
          @updated_at
        )
      `
      )
      .run({
        default_language_hint:
          DEFAULT_LOCAL_NODE_SETTINGS.default_language_hint,
        default_safety_label: DEFAULT_LOCAL_NODE_SETTINGS.default_safety_label,
        sync_mode: DEFAULT_LOCAL_NODE_SETTINGS.sync_mode,
        developer_mode: booleanToSqliteInteger(
          DEFAULT_LOCAL_NODE_SETTINGS.developer_mode
        ),
        show_debug_panels: booleanToSqliteInteger(
          DEFAULT_LOCAL_NODE_SETTINGS.show_debug_panels
        ),
        updated_at: updatedAt,
      });

    const settings = this.getLocalNodeSettingsRow();

    if (!settings) {
      throw new Error("Failed to create local node settings");
    }

    return toLocalNodeSettings(settings);
  }

  updateLocalNodeSettings(
    input: LocalNodeSettingsUpdate
  ): LocalNodeSettings {
    const existingSettings = this.getOrCreateLocalNodeSettings();
    const languageHint = input.default_language_hint?.trim();

    if (
      input.default_language_hint === undefined &&
      input.default_safety_label === undefined &&
      input.sync_mode === undefined &&
      input.developer_mode === undefined &&
      input.show_debug_panels === undefined
    ) {
      throw new Error("at least one settings field is required");
    }

    if (input.default_language_hint !== undefined) {
      if (!languageHint) {
        throw new Error("default_language_hint must be a non-empty string");
      }

      if (languageHint.length > 40) {
        throw new Error("default_language_hint must be 40 characters or less");
      }
    }

    if (input.sync_mode !== undefined && input.sync_mode !== "manual") {
      throw new Error("sync_mode must be manual");
    }

    const updatedAt = Math.max(
      currentUnixSeconds(),
      existingSettings.updated_at + 1
    );

    this.db
      .prepare(
        `
        UPDATE local_node_settings
        SET
          default_language_hint = @default_language_hint,
          default_safety_label = @default_safety_label,
          sync_mode = @sync_mode,
          developer_mode = @developer_mode,
          show_debug_panels = @show_debug_panels,
          updated_at = @updated_at
        WHERE id = 1
      `
      )
      .run({
        default_language_hint:
          languageHint ?? existingSettings.default_language_hint,
        default_safety_label:
          input.default_safety_label ?? existingSettings.default_safety_label,
        sync_mode: input.sync_mode ?? existingSettings.sync_mode,
        developer_mode: booleanToSqliteInteger(
          input.developer_mode ?? existingSettings.developer_mode
        ),
        show_debug_panels: booleanToSqliteInteger(
          input.show_debug_panels ?? existingSettings.show_debug_panels
        ),
        updated_at: updatedAt,
      });

    const updatedSettings = this.getLocalNodeSettingsRow();

    if (!updatedSettings) {
      throw new Error("Failed to update local node settings");
    }

    return toLocalNodeSettings(updatedSettings);
  }

  private getLocalNodeIdentityRow(): LocalNodeIdentityRow | undefined {
    return this.db
      .prepare(
        `
        SELECT
          id,
          node_id,
          display_name,
          default_author,
          created_at,
          updated_at
        FROM local_node_identity
        WHERE id = 1
      `
      )
      .get() as LocalNodeIdentityRow | undefined;
  }

  private getLocalNodeSettingsRow(): LocalNodeSettingsRow | undefined {
    return this.db
      .prepare(
        `
        SELECT
          id,
          default_language_hint,
          default_safety_label,
          sync_mode,
          developer_mode,
          show_debug_panels,
          updated_at
        FROM local_node_settings
        WHERE id = 1
      `
      )
      .get() as LocalNodeSettingsRow | undefined;
  }

  savePacket(packet: LmpPacket, packetSize: PacketSizeEstimate): void {
    const refs = extractRefs(packet);

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO packets (
          packet_id,
          packet_type,
          zone,
          author,
          parent,
          phrase_id,
          meaning_id,
          symbol_id,
          payload_hash,
          payload_json,
          packet_json,
          packet_size_bytes,
          packet_size_class,
          size_recommendation,
          created_at,
          received_at
        )
        VALUES (
          @packet_id,
          @packet_type,
          @zone,
          @author,
          @parent,
          @phrase_id,
          @meaning_id,
          @symbol_id,
          @payload_hash,
          @payload_json,
          @packet_json,
          @packet_size_bytes,
          @packet_size_class,
          @size_recommendation,
          @created_at,
          @received_at
        )
      `
      )
      .run({
        packet_id: packet.packet_id,
        packet_type: packet.packet_type,
        zone: packet.zone,
        author: packet.author,
        parent: packet.parent ?? null,
        phrase_id: refs.phrase_id ?? null,
        meaning_id: refs.meaning_id ?? null,
        symbol_id: refs.symbol_id ?? null,
        payload_hash: packet.payload_hash,
        payload_json: JSON.stringify(packet.payload),
        packet_json: JSON.stringify(packet),
        packet_size_bytes: packetSize.bytes,
        packet_size_class: packetSize.sizeClass,
        size_recommendation: packetSize.recommendation,
        created_at: packet.created_at,
        received_at: Math.floor(Date.now() / 1000),
      });
  }

  upsertPhrase(
    payload: PhraseObservedPayload,
    safetyLabel: SafetyLabel
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO phrases (
          phrase_id,
          surface_text,
          phonetic_hint,
          language_hint,
          safety_label,
          updated_at
        )
        VALUES (
          @phrase_id,
          @surface_text,
          @phonetic_hint,
          @language_hint,
          @safety_label,
          @updated_at
        )
        ON CONFLICT(phrase_id) DO UPDATE SET
          surface_text = COALESCE(excluded.surface_text, phrases.surface_text),
          phonetic_hint = COALESCE(excluded.phonetic_hint, phrases.phonetic_hint),
          language_hint = COALESCE(excluded.language_hint, phrases.language_hint),
          safety_label = CASE
            WHEN phrases.safety_label != 'normal'
              AND excluded.safety_label = 'normal'
            THEN phrases.safety_label
            ELSE excluded.safety_label
          END,
          updated_at = excluded.updated_at
      `
      )
      .run({
        phrase_id: payload.phrase_id,
        surface_text: payload.surface_text ?? null,
        phonetic_hint: payload.phonetic_hint ?? null,
        language_hint: payload.language_hint ?? null,
        safety_label: safetyLabel,
        updated_at: Math.floor(Date.now() / 1000),
      });
  }

  upsertMeaning(phrase_id: string, meaning: MeaningRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO meanings (
          meaning_id,
          phrase_id,
          reference_meaning,
          context,
          confidence,
          confirms,
          rejects,
          updated_at
        )
        VALUES (
          @meaning_id,
          @phrase_id,
          @reference_meaning,
          @context,
          @confidence,
          @confirms,
          @rejects,
          @updated_at
        )
        ON CONFLICT(meaning_id) DO UPDATE SET
          reference_meaning = excluded.reference_meaning,
          context = excluded.context,
          confidence = excluded.confidence,
          confirms = excluded.confirms,
          rejects = excluded.rejects,
          updated_at = excluded.updated_at
      `
      )
      .run({
        meaning_id: meaning.meaning_id,
        phrase_id,
        reference_meaning: meaning.reference_meaning,
        context: meaning.context ?? null,
        confidence: meaning.confidence,
        confirms: meaning.confirms,
        rejects: meaning.rejects,
        updated_at: Math.floor(Date.now() / 1000),
      });
  }

  recordVote(packet: LmpPacket, payload: MeaningVotePayload): void {
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO votes (
          vote_packet_id,
          phrase_id,
          meaning_id,
          vote,
          confidence,
          author,
          created_at
        )
        VALUES (
          @vote_packet_id,
          @phrase_id,
          @meaning_id,
          @vote,
          @confidence,
          @author,
          @created_at
        )
      `
      )
      .run({
        vote_packet_id: packet.packet_id,
        phrase_id: payload.phrase_id,
        meaning_id: payload.meaning_id,
        vote: payload.vote,
        confidence: payload.confidence,
        author: packet.author,
        created_at: packet.created_at,
      });
  }

  setSafetyLabel(payload: SafetyLabelPayload): void {
    this.db
      .prepare(
        `
        INSERT INTO phrases (
          phrase_id,
          surface_text,
          phonetic_hint,
          language_hint,
          safety_label,
          updated_at
        )
        VALUES (
          @phrase_id,
          NULL,
          NULL,
          NULL,
          @safety_label,
          @updated_at
        )
        ON CONFLICT(phrase_id) DO UPDATE SET
          safety_label = excluded.safety_label,
          updated_at = excluded.updated_at
      `
      )
      .run({
        phrase_id: payload.phrase_id,
        safety_label: payload.label,
        updated_at: Math.floor(Date.now() / 1000),
      });
  }

  listKnowledge(): KnowledgePhraseRecord[] {
    const phrases = this.db
      .prepare(
        `
        SELECT phrase_id, surface_text, phonetic_hint, language_hint, safety_label
        FROM phrases
        ORDER BY updated_at DESC
      `
      )
      .all() as PhraseRow[];

    return this.attachMeanings(phrases);
  }

  findPhraseById(phraseId: string): KnowledgePhraseRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT phrase_id, surface_text, phonetic_hint, language_hint, safety_label
        FROM phrases
        WHERE phrase_id = ?
        LIMIT 1
      `
      )
      .get(phraseId) as PhraseRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.attachMeanings([row])[0];
  }

  searchPhrases(query: string, limit = 25): KnowledgePhraseRecord[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const pattern = `%${escapeLikePattern(normalizedQuery)}%`;
    const rows = this.db
      .prepare(
        `
        SELECT phrase_id, surface_text, phonetic_hint, language_hint, safety_label
        FROM phrases
        WHERE
          LOWER(phrase_id) LIKE @pattern ESCAPE '\\'
          OR LOWER(COALESCE(surface_text, '')) LIKE @pattern ESCAPE '\\'
          OR LOWER(COALESCE(phonetic_hint, '')) LIKE @pattern ESCAPE '\\'
          OR LOWER(COALESCE(language_hint, '')) LIKE @pattern ESCAPE '\\'
        ORDER BY updated_at DESC
        LIMIT @limit
      `
      )
      .all({
        pattern,
        limit: clampLookupLimit(limit),
      }) as PhraseRow[];

    return this.attachMeanings(rows);
  }

  private attachMeanings(phrases: PhraseRow[]): KnowledgePhraseRecord[] {
    const meaningsStatement = this.db.prepare(
      `
      SELECT meaning_id, phrase_id, reference_meaning, context, confidence, confirms, rejects
      FROM meanings
      WHERE phrase_id = ?
      ORDER BY confidence DESC
    `
    );

    return phrases.map((phrase) => {
      const meanings = meaningsStatement.all(phrase.phrase_id) as MeaningRow[];

      return {
        phrase_id: phrase.phrase_id,
        surface_text: phrase.surface_text ?? undefined,
        phonetic_hint: phrase.phonetic_hint ?? undefined,
        language_hint: phrase.language_hint ?? undefined,
        safety_label: phrase.safety_label,
        meanings: meanings.map((meaning): KnowledgeMeaningRecord => ({
          meaning_id: meaning.meaning_id,
          reference_meaning: meaning.reference_meaning,
          context: meaning.context ?? undefined,
          confidence: meaning.confidence,
          confirms: meaning.confirms,
          rejects: meaning.rejects,
        })),
      };
    });
  }
    listPacketSummaries(limit = 100): PacketSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          packet_id,
          packet_type,
          zone,
          author,
          parent,
          phrase_id,
          meaning_id,
          symbol_id,
          payload_hash,
          packet_size_bytes,
          packet_size_class,
          size_recommendation,
          created_at,
          received_at
        FROM packets
        ORDER BY received_at DESC
        LIMIT ?
      `
      )
      .all(limit) as PacketSummary[];

    return rows.map((row) => ({
      ...row,
      parent: row.parent ?? undefined,
      phrase_id: row.phrase_id ?? undefined,
      meaning_id: row.meaning_id ?? undefined,
      symbol_id: row.symbol_id ?? undefined,
    }));
  }

  listPacketsAfter(receivedAfter: number, limit = 100): LmpPacket[] {
    const rows = this.db
      .prepare(
        `
        SELECT packet_json
        FROM packets
        WHERE received_at > ?
        ORDER BY received_at ASC
        LIMIT ?
      `
      )
      .all(receivedAfter, limit) as PacketRow[];

    return rows.map((row) => JSON.parse(row.packet_json) as LmpPacket);
  }

  listPacketSyncBatch(cursor = "0:", limit = 100): PacketSyncBatch {
    const cursorBefore = decodeSyncCursor(cursor);
    const normalizedLimit = clampSyncLimit(limit);

    const rows = this.db
      .prepare(
        `
        SELECT packet_id, received_at, packet_json
        FROM packets
        WHERE
          received_at > @received_at
          OR (
            received_at = @received_at
            AND packet_id > @packet_id
          )
        ORDER BY received_at ASC, packet_id ASC
        LIMIT @limit
      `
      )
      .all({
        received_at: cursorBefore.received_at,
        packet_id: cursorBefore.packet_id,
        limit: normalizedLimit,
      }) as SyncPacketRow[];

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;

    return {
      cursor_before: encodeSyncCursor(
        cursorBefore.received_at,
        cursorBefore.packet_id
      ),
      cursor_after: lastRow
        ? encodeSyncCursor(lastRow.received_at, lastRow.packet_id)
        : encodeSyncCursor(cursorBefore.received_at, cursorBefore.packet_id),
      packet_count: rows.length,
      packets: rows.map((row) => JSON.parse(row.packet_json) as LmpPacket),
    };
  }

  countPackets(): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM packets
      `
      )
      .get() as { count: number };

    return row.count;
  }

  getPacketCount(): number {
    return this.countPackets();
  }

  hasPacket(packetId: string): boolean {
    const row = this.db
      .prepare(
        `
        SELECT 1 AS found
        FROM packets
        WHERE packet_id = ?
        LIMIT 1
      `
      )
      .get(packetId) as { found: number } | undefined;

    return row !== undefined;
  }
    getPeerSyncCursor(peerAuthor: string): PeerSyncCursor {
    const row = this.db
      .prepare(
        `
        SELECT peer_author, cursor, updated_at
        FROM peer_sync_cursors
        WHERE peer_author = ?
      `
      )
      .get(peerAuthor) as PeerSyncCursor | undefined;

    if (row) {
      return row;
    }

    return {
      peer_author: peerAuthor,
      cursor: "0:",
      updated_at: 0,
    };
  }

  setPeerSyncCursor(peerAuthor: string, cursor: string): PeerSyncCursor {
    const decodedCursor = decodeSyncCursor(cursor);
    const normalizedCursor = encodeSyncCursor(
      decodedCursor.received_at,
      decodedCursor.packet_id
    );
    const existingCursor = this.getPeerSyncCursor(peerAuthor);

    if (compareSyncCursors(normalizedCursor, existingCursor.cursor) < 0) {
      throw new Error(
        `Refusing to move sync cursor backwards for ${peerAuthor}. Current ${existingCursor.cursor}, requested ${normalizedCursor}`
      );
    }

    const updatedAt = Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        `
        INSERT INTO peer_sync_cursors (
          peer_author,
          cursor,
          updated_at
        )
        VALUES (
          @peer_author,
          @cursor,
          @updated_at
        )
        ON CONFLICT(peer_author) DO UPDATE SET
          cursor = excluded.cursor,
          updated_at = excluded.updated_at
      `
      )
      .run({
        peer_author: peerAuthor,
        cursor: normalizedCursor,
        updated_at: updatedAt,
      });

    return {
      peer_author: peerAuthor,
      cursor: normalizedCursor,
      updated_at: updatedAt,
    };
  }

  listPeerSyncCursors(): PeerSyncCursor[] {
    return this.db
      .prepare(
        `
        SELECT peer_author, cursor, updated_at
        FROM peer_sync_cursors
        ORDER BY updated_at DESC, peer_author ASC
      `
      )
      .all() as PeerSyncCursor[];
  }

  getPacketsByIds(packetIds: string[]): LmpPacket[] {
    if (packetIds.length === 0) {
      return [];
    }

    const placeholders = packetIds.map(() => "?").join(",");

    const rows = this.db
      .prepare(
        `
        SELECT packet_json
        FROM packets
        WHERE packet_id IN (${placeholders})
      `
      )
      .all(...packetIds) as PacketRow[];

    return rows.map((row) => JSON.parse(row.packet_json) as LmpPacket);
  }

  listPacketsForPhraseByTypes(
    phraseId: string,
    packetTypes: PacketType[]
  ): LmpPacket[] {
    if (packetTypes.length === 0) {
      return [];
    }

    const placeholders = packetTypes.map(() => "?").join(",");

    const rows = this.db
      .prepare(
        `
        SELECT packet_json
        FROM packets
        WHERE phrase_id = ?
          AND packet_type IN (${placeholders})
        ORDER BY received_at ASC, packet_id ASC
      `
      )
      .all(phraseId, ...packetTypes) as PacketRow[];

    return rows.map((row) => JSON.parse(row.packet_json) as LmpPacket);
  }

  listPacketsByPhraseAndTypes(
    phraseId: string,
    packetTypes: PacketType[]
  ): LmpPacket[] {
    return this.listPacketsForPhraseByTypes(phraseId, packetTypes);
  }
}
