import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import {
  MAX_SYNC_BATCH_PACKETS,
  estimatePacketBatchSize,
} from "../protocol/packetSize";
import type { PhraseObservedPayload } from "../protocol/packetTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "sync_batch_size_guard_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "sync_batch_size_guard_node_b.db");

const ZONE = "sync_batch_size_guard_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_sync_batch_guard_a";
const NODE_B_AUTHOR = "dev_public_key_sync_batch_guard_b";

function clearSqliteDatabase(dbPath: string): void {
  for (const filePath of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function assertSimulation(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createEngine(author: string, dbPath: string): LanguageEngine {
  return new LanguageEngine({
    zone: ZONE,
    author,
    nodeAgeGroup: "adult",
    dbPath,
  });
}

function phrasePayload(phraseId: string): PhraseObservedPayload {
  return {
    phrase_id: phraseId,
    surface_text: phraseId.replace(/_/g, " "),
    language_hint: "en",
    input_type: "text",
  };
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);

  const normalPhraseId = "sync_batch_guard_normal_phrase";
  const normalPacket = nodeA.observePhrase(phrasePayload(normalPhraseId));
  const normalBatch = nodeA.pullSyncBatch();
  const normalImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: normalBatch.cursor_before,
    cursorAfter: normalBatch.cursor_after,
    packets: normalBatch.packets,
  });

  assertSimulation(
    normalBatch.packet_count === 1,
    `Expected normal sync batch to contain 1 packet, got ${normalBatch.packet_count}`
  );
  assertSimulation(
    normalImport.summary.accepted_new === 1,
    `Expected normal sync import to accept 1 packet, got ${normalImport.summary.accepted_new}`
  );
  assertSimulation(
    nodeB.getPacketsByIds([normalPacket.packet.packet_id]).length === 1,
    `Expected receiver to store normal packet ${normalPacket.packet.packet_id}`
  );

  for (let index = 0; index < MAX_SYNC_BATCH_PACKETS + 1; index += 1) {
    nodeA.observePhrase(
      phrasePayload(`sync_batch_guard_oversized_phrase_${index}`)
    );
  }

  const oversizedPackets = nodeA
    .exportLedgerPackets()
    .filter((packet) => packet.packet_id !== normalPacket.packet.packet_id)
    .slice(0, MAX_SYNC_BATCH_PACKETS + 1);
  const oversizedPacketIds = oversizedPackets.map((packet) => packet.packet_id);
  const cursorBeforeOversized = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;
  const oversizedCursorAfter = `${Math.floor(Date.now() / 1000)}:oversized_sync_batch`;
  let oversizedRejected = false;
  let oversizedError = "";

  assertSimulation(
    oversizedPackets.length === MAX_SYNC_BATCH_PACKETS + 1,
    `Expected oversized batch to contain ${MAX_SYNC_BATCH_PACKETS + 1} packets, got ${oversizedPackets.length}`
  );

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: cursorBeforeOversized,
      cursorAfter: oversizedCursorAfter,
      packets: oversizedPackets,
    });
  } catch (error) {
    oversizedRejected = true;
    oversizedError = error instanceof Error ? error.message : String(error);
  }

  assertSimulation(
    oversizedRejected,
    "Expected oversized sync batch import to be rejected"
  );
  assertSimulation(
    oversizedError.includes("Sync batch size limit exceeded"),
    `Expected oversized rejection to explain size limit, got: ${oversizedError}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === cursorBeforeOversized,
    "Expected oversized sync rejection to leave receiver cursor unchanged"
  );
  assertSimulation(
    nodeB.getPacketsByIds(oversizedPacketIds).length === 0,
    "Expected oversized sync rejection not to store any oversized packets"
  );

  const oversizedEstimate = estimatePacketBatchSize(oversizedPackets);

  console.log("normal sync batch import passed");
  console.log(
    `oversized sync batch rejected: ${oversizedEstimate.packetCount} packets, ${oversizedEstimate.bytes} bytes`
  );
  console.log("oversized sync cursor rollback passed");
  console.log("oversized sync no-partial-storage passed");
  console.log("Sync batch size guard simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Sync batch size guard simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
