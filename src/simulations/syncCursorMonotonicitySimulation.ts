import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import type { LmpPacket } from "../protocol/packet";
import type { PhraseObservedPayload } from "../protocol/packetTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "sync_cursor_monotonicity_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "sync_cursor_monotonicity_node_b.db");

const ZONE = "sync_cursor_monotonicity_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_sync_cursor_a";
const NODE_B_AUTHOR = "dev_public_key_sync_cursor_b";

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

function assertPacketStored(engine: LanguageEngine, packet: LmpPacket): void {
  assertSimulation(
    engine.getPacketsByIds([packet.packet_id]).length === 1,
    `Expected receiver to store packet ${packet.packet_id}`
  );
}

function assertPacketNotStored(engine: LanguageEngine, packet: LmpPacket): void {
  assertSimulation(
    engine.getPacketsByIds([packet.packet_id]).length === 0,
    `Expected receiver not to store packet ${packet.packet_id}`
  );
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);

  const packet1 = nodeA.observePhrase(
    phrasePayload("sync_cursor_monotonicity_packet_1")
  ).packet;
  const batch1 = nodeA.pullSyncBatch();
  const import1 = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: batch1.cursor_before,
    cursorAfter: batch1.cursor_after,
    packets: batch1.packets,
  });
  const cursorAfterPacket1 = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;

  assertSimulation(
    import1.summary.accepted_new === 1,
    `Expected first import to accept 1 packet, got ${import1.summary.accepted_new}`
  );
  assertSimulation(
    cursorAfterPacket1 === batch1.cursor_after,
    `Expected receiver cursor ${batch1.cursor_after}, got ${cursorAfterPacket1}`
  );
  assertPacketStored(nodeB, packet1);

  await delay(1100);

  const packet2 = nodeA.observePhrase(
    phrasePayload("sync_cursor_monotonicity_packet_2")
  ).packet;
  const batch2 = nodeA.pullSyncBatch(cursorAfterPacket1);
  const import2 = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: batch2.cursor_before,
    cursorAfter: batch2.cursor_after,
    packets: batch2.packets,
  });
  const latestCursor = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;

  assertSimulation(
    import2.summary.accepted_new === 1,
    `Expected second import to accept 1 packet, got ${import2.summary.accepted_new}`
  );
  assertSimulation(
    latestCursor === batch2.cursor_after,
    `Expected receiver cursor ${batch2.cursor_after}, got ${latestCursor}`
  );
  assertSimulation(
    latestCursor !== cursorAfterPacket1,
    "Expected second import to advance receiver cursor"
  );
  assertPacketStored(nodeB, packet2);

  const duplicateImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: latestCursor,
    cursorAfter: latestCursor,
    packets: [packet2],
  });

  assertSimulation(
    duplicateImport.summary.already_stored === 1,
    `Expected duplicate import to report already_stored 1, got ${duplicateImport.summary.already_stored}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === latestCursor,
    "Expected duplicate import to leave receiver cursor unchanged"
  );

  const nonAdvancingCursorPacket = nodeA.observePhrase(
    phrasePayload("sync_cursor_monotonicity_non_advancing_rejected")
  ).packet;
  let nonAdvancingCursorRejected = false;
  let nonAdvancingCursorError = "";

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: latestCursor,
      cursorAfter: latestCursor,
      packets: [nonAdvancingCursorPacket],
    });
  } catch (error) {
    nonAdvancingCursorRejected = true;
    nonAdvancingCursorError =
      error instanceof Error ? error.message : String(error);
  }

  assertSimulation(
    nonAdvancingCursorRejected,
    "Expected non-advancing cursor import with a new packet to be rejected"
  );
  assertSimulation(
    nonAdvancingCursorError.includes("Sync cursor did not advance"),
    `Expected non-advancing cursor rejection to explain cursor movement, got: ${nonAdvancingCursorError}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === latestCursor,
    "Expected non-advancing cursor rejection to leave receiver cursor at latest value"
  );
  assertPacketNotStored(nodeB, nonAdvancingCursorPacket);

  await delay(1100);

  const stalePayloadPacket = nodeA.observePhrase(
    phrasePayload("sync_cursor_monotonicity_stale_rejected")
  ).packet;
  let staleRejected = false;
  let staleError = "";

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: batch1.cursor_before,
      cursorAfter: batch1.cursor_after,
      packets: [stalePayloadPacket],
    });
  } catch (error) {
    staleRejected = true;
    staleError = error instanceof Error ? error.message : String(error);
  }

  assertSimulation(staleRejected, "Expected stale cursor import to be rejected");
  assertSimulation(
    staleError.includes("Sync cursor mismatch"),
    `Expected stale cursor rejection to explain cursor mismatch, got: ${staleError}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === latestCursor,
    "Expected stale cursor rejection to leave receiver cursor at latest value"
  );
  assertPacketNotStored(nodeB, stalePayloadPacket);

  await delay(1100);

  const regressingCursorAfterPacket = nodeA.observePhrase(
    phrasePayload("sync_cursor_monotonicity_regressing_after_rejected")
  ).packet;
  let regressingCursorAfterRejected = false;
  let regressingCursorAfterError = "";

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: latestCursor,
      cursorAfter: cursorAfterPacket1,
      packets: [regressingCursorAfterPacket],
    });
  } catch (error) {
    regressingCursorAfterRejected = true;
    regressingCursorAfterError =
      error instanceof Error ? error.message : String(error);
  }

  assertSimulation(
    regressingCursorAfterRejected,
    "Expected regressing cursor_after import to be rejected"
  );
  assertSimulation(
    regressingCursorAfterError.includes("Sync cursor regression"),
    `Expected regressing cursor_after rejection to explain cursor regression, got: ${regressingCursorAfterError}`
  );
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === latestCursor,
    "Expected regressing cursor_after rejection to leave receiver cursor at latest value"
  );
  assertPacketNotStored(nodeB, regressingCursorAfterPacket);
  assertPacketStored(nodeB, packet1);
  assertPacketStored(nodeB, packet2);

  console.log("normal cursor advancement passed");
  console.log("duplicate import cursor stability passed");
  console.log("non-advancing cursor rejection passed");
  console.log("stale cursorBefore rejection passed");
  console.log("regressing cursorAfter rejection passed");
  console.log("sync cursor no-partial-storage passed");
  console.log("Sync cursor monotonicity simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Sync cursor monotonicity simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
