import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type { PhraseObservedPayload } from "../protocol/packetTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "sync_import_atomicity_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "sync_import_atomicity_node_b.db");

const ZONE = "sync_import_atomicity_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_sync_import_atomicity_a";
const NODE_B_AUTHOR = "dev_public_key_sync_import_atomicity_b";

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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

function findPhrase(engine: LanguageEngine, phraseId: string) {
  return engine.listKnowledge().find((phrase) => phrase.phrase_id === phraseId);
}

function corruptPhrasePacket(packet: LmpPacket): LmpPacket {
  return {
    ...packet,
    payload: {
      ...(packet.payload as PhraseObservedPayload),
      surface_text: "corrupted without updating hash",
    },
  };
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);

  const phraseId1 = "sync_import_atomicity_phrase_1";
  const phraseId2 = "sync_import_atomicity_phrase_2";
  const packet1 = nodeA.observePhrase(phrasePayload(phraseId1)).packet;

  await delay(1100);

  const packet2 = nodeA.observePhrase(phrasePayload(phraseId2)).packet;
  const cleanBatch = nodeA.pullSyncBatch();
  const corruptedPacket2 = corruptPhrasePacket(packet2);
  const cursorBeforeFailedImport = nodeB.getPeerSyncCursor(NODE_A_AUTHOR)
    .cursor;
  let failedImportRejected = false;
  let failedImportError = "";

  assertSimulation(
    cleanBatch.packet_count === 2,
    `Expected clean batch to contain 2 packets, got ${cleanBatch.packet_count}`
  );

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: cleanBatch.cursor_before,
      cursorAfter: cleanBatch.cursor_after,
      packets: [packet1, corruptedPacket2],
    });
  } catch (error) {
    failedImportRejected = true;
    failedImportError = error instanceof Error ? error.message : String(error);
  }

  assertSimulation(
    failedImportRejected,
    "Expected mixed valid/corrupt sync batch to fail"
  );
  assertSimulation(
    failedImportError.includes("Invalid payload_hash") ||
      failedImportError.includes("Invalid packet_id"),
    `Expected corrupt packet rejection to mention invalid hash or packet id, got: ${failedImportError}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === cursorBeforeFailedImport,
    "Expected failed atomic import to leave receiver cursor unchanged"
  );
  assertSimulation(
    nodeB.getPacketsByIds([packet1.packet_id, packet2.packet_id]).length === 0,
    "Expected failed atomic import to store neither batch packet"
  );
  assertSimulation(
    findPhrase(nodeB, phraseId1) === undefined,
    `Expected failed atomic import not to apply phrase ${phraseId1}`
  );
  assertSimulation(
    findPhrase(nodeB, phraseId2) === undefined,
    `Expected failed atomic import not to apply phrase ${phraseId2}`
  );

  const successfulImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: cleanBatch.cursor_before,
    cursorAfter: cleanBatch.cursor_after,
    packets: [packet1, packet2],
  });

  assertSimulation(
    successfulImport.summary.accepted_new === 2,
    `Expected clean atomic import to accept 2 packets, got ${successfulImport.summary.accepted_new}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === cleanBatch.cursor_after,
    `Expected clean atomic import to advance cursor to ${cleanBatch.cursor_after}`
  );
  assertSimulation(
    nodeB.getPacketsByIds([packet1.packet_id, packet2.packet_id]).length === 2,
    "Expected clean atomic import to store both packets"
  );
  assertSimulation(
    findPhrase(nodeB, phraseId1) !== undefined,
    `Expected clean atomic import to apply phrase ${phraseId1}`
  );
  assertSimulation(
    findPhrase(nodeB, phraseId2) !== undefined,
    `Expected clean atomic import to apply phrase ${phraseId2}`
  );

  console.log("mixed corrupt sync batch rejection passed");
  console.log("failed sync import storage rollback passed");
  console.log("failed sync import knowledge rollback passed");
  console.log("failed sync import cursor rollback passed");
  console.log("clean sync import after rollback passed");
  console.log("Sync import atomicity simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Sync import atomicity simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
