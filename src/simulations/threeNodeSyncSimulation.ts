import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import type { PhraseObservedPayload } from "../protocol/packetTypes";
import type { SyncResultSummary } from "../sync/SyncResultSummary";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "three_node_sync_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "three_node_sync_node_b.db");
const NODE_C_DB = path.join(DATA_DIR, "three_node_sync_node_c.db");

const ZONE = "three_node_sync_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_three_node_a";
const NODE_B_AUTHOR = "dev_public_key_three_node_b";
const NODE_C_AUTHOR = "dev_public_key_three_node_c";

const SYNC_SUMMARY_FIELDS: (keyof SyncResultSummary)[] = [
  "accepted_new",
  "already_stored",
  "rejected_invalid",
  "rejected_expired",
  "failed_apply",
];

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

function findPhrase(engine: LanguageEngine, phraseId: string) {
  return engine
    .listKnowledge()
    .find((phrase) => phrase.phrase_id === phraseId);
}

function assertSyncSummaryFields(summary: SyncResultSummary): void {
  for (const field of SYNC_SUMMARY_FIELDS) {
    assertSimulation(
      typeof summary[field] === "number",
      `Expected sync summary field ${field} to be present as a number`
    );
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

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);
  clearSqliteDatabase(NODE_C_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);
  const nodeC = createEngine(NODE_C_AUTHOR, NODE_C_DB);

  const phrasePayload: PhraseObservedPayload = {
    phrase_id: "three_node_sync_phrase_001",
    surface_text: "three node sync ah?",
    phonetic_hint: "three-node-sync-aa",
    language_hint: "Tamil-English slang",
    input_type: "speech",
  };

  const phraseResult = nodeA.observePhrase(phrasePayload);

  const nodeAToNodeBBatch = nodeA.pullSyncBatch();
  const nodeAToNodeBImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: nodeAToNodeBBatch.cursor_before,
    cursorAfter: nodeAToNodeBBatch.cursor_after,
    packets: nodeAToNodeBBatch.packets,
  });

  assertSyncSummaryFields(nodeAToNodeBImport.summary);
  assertSimulation(
    nodeAToNodeBBatch.packet_count === 1,
    `Expected node A -> node B batch to contain 1 packet, got ${nodeAToNodeBBatch.packet_count}`
  );
  assertSimulation(
    nodeAToNodeBImport.summary.accepted_new === 1,
    `Expected node B to accept 1 packet from node A, got ${nodeAToNodeBImport.summary.accepted_new}`
  );
  assertSimulation(
    findPhrase(nodeB, phrasePayload.phrase_id) !== undefined,
    `Expected node B to contain phrase ${phrasePayload.phrase_id}`
  );

  const nodeBToNodeCBatch = nodeB.pullSyncBatch();
  const nodeBToNodeCImport = nodeC.importSyncBatch({
    peerAuthor: NODE_B_AUTHOR,
    cursorBefore: nodeBToNodeCBatch.cursor_before,
    cursorAfter: nodeBToNodeCBatch.cursor_after,
    packets: nodeBToNodeCBatch.packets,
  });

  assertSyncSummaryFields(nodeBToNodeCImport.summary);
  assertSimulation(
    nodeBToNodeCBatch.packet_count === 1,
    `Expected node B -> node C batch to contain 1 packet, got ${nodeBToNodeCBatch.packet_count}`
  );
  assertSimulation(
    nodeBToNodeCImport.summary.accepted_new === 1,
    `Expected node C to accept 1 packet from node B, got ${nodeBToNodeCImport.summary.accepted_new}`
  );
  assertSimulation(
    findPhrase(nodeC, phrasePayload.phrase_id) !== undefined,
    `Expected node C to receive phrase ${phrasePayload.phrase_id} through node B`
  );
  assertSimulation(
    nodeC.getPacketsByIds([phraseResult.packet.packet_id]).length === 1,
    `Expected node C to store original node A packet ${phraseResult.packet.packet_id}`
  );

  const nodeCPacket = nodeC.getPacketsByIds([phraseResult.packet.packet_id])[0];

  assertSimulation(
    nodeCPacket.author === NODE_A_AUTHOR,
    `Expected node C packet author to remain ${NODE_A_AUTHOR}, got ${nodeCPacket.author}`
  );

  const duplicateCursor = nodeC.getPeerSyncCursor(NODE_B_AUTHOR).cursor;
  const duplicateImport = nodeC.importSyncBatch({
    peerAuthor: NODE_B_AUTHOR,
    cursorBefore: duplicateCursor,
    cursorAfter: duplicateCursor,
    packets: nodeBToNodeCBatch.packets,
  });

  assertSyncSummaryFields(duplicateImport.summary);
  assertSimulation(
    duplicateImport.summary.accepted_new === 0,
    `Expected duplicate node B -> node C import to accept 0 new packets, got ${duplicateImport.summary.accepted_new}`
  );
  assertSimulation(
    duplicateImport.summary.already_stored === 1,
    `Expected duplicate node B -> node C import to report 1 already stored packet, got ${duplicateImport.summary.already_stored}`
  );

  const restartedNodeC = createEngine(NODE_C_AUTHOR, NODE_C_DB);

  assertSimulation(
    findPhrase(restartedNodeC, phrasePayload.phrase_id) !== undefined,
    `Expected restarted node C to still contain phrase ${phrasePayload.phrase_id}`
  );
  assertSimulation(
    restartedNodeC.getPacketsByIds([phraseResult.packet.packet_id]).length === 1,
    `Expected restarted node C to still store packet ${phraseResult.packet.packet_id}`
  );

  console.log(
    `three-node propagation passed: ${phrasePayload.phrase_id} moved A -> B -> C`
  );
  console.log("node C received node A packet without direct node A import");
  console.log("three-node duplicate protection passed");
  console.log("three-node restart persistence passed");
  console.log("Three-node sync simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Three-node sync simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
