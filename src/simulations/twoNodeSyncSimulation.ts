import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { PhraseObservedPayload } from "../protocol/packetTypes";
import { SafetyLabel } from "../safety/safetyLabels";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "two_node_sync_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "two_node_sync_node_b.db");

const ZONE = "two_node_sync_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_two_node_a";
const NODE_B_AUTHOR = "dev_public_key_two_node_b";

const NON_NORMAL_SAFETY_LABEL: SafetyLabel | undefined = "mild_slang";

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

function findPhrase(engine: LanguageEngine, phraseId: string) {
  return engine
    .listKnowledge()
    .find((phrase) => phrase.phrase_id === phraseId);
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

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);

  const phrasePayload: PhraseObservedPayload = {
    phrase_id: "two_node_sync_phrase_001",
    surface_text: "sync ah?",
    phonetic_hint: "sink-aa",
    language_hint: "Tamil-English slang",
    input_type: "speech",
  };

  const phraseResult = nodeA.observePhrase(phrasePayload);
  const firstBatch = nodeA.pullSyncBatch();
  const firstImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: firstBatch.cursor_before,
    cursorAfter: firstBatch.cursor_after,
    packets: firstBatch.packets,
  });

  const importedPhrase = findPhrase(nodeB, phrasePayload.phrase_id);

  assertSimulation(
    firstBatch.packet_count === 1,
    `Expected first sync batch to contain 1 packet, got ${firstBatch.packet_count}`
  );
  assertSimulation(
    firstImport.accepted_new_count === 1,
    `Expected node B to accept 1 new packet, got ${firstImport.accepted_new_count}`
  );
  assertSimulation(
    importedPhrase !== undefined,
    `Node B knowledge is missing phrase ${phrasePayload.phrase_id}`
  );

  const nodeBCursor = nodeB.getPeerSyncCursor(NODE_A_AUTHOR);
  const secondBatch = nodeA.pullSyncBatch(nodeBCursor.cursor);

  assertSimulation(
    secondBatch.packet_count === 0,
    `Expected second sync batch to contain 0 packets, got ${secondBatch.packet_count}`
  );

  console.log("Two-node sync simulation succeeded.");
  console.log(
    `Node A observed ${phrasePayload.phrase_id} with packet ${phraseResult.packet.packet_id}.`
  );
  console.log(
    `Node B imported ${firstImport.accepted_new_count} new packet(s) and saved cursor ${nodeBCursor.cursor}.`
  );
  console.log("Second pull from Node A using Node B cursor returned 0 packets.");

  if (!NON_NORMAL_SAFETY_LABEL) {
    console.log("Safety label survival check skipped: no non-normal label exists.");
    return;
  }

  // Sync cursors use second-level timestamps, so place this follow-up event in
  // the next second after the saved cursor.
  await delay(1100);

  const safetyPhrasePayload: PhraseObservedPayload = {
    phrase_id: "two_node_sync_safety_phrase_001",
    surface_text: "safe sync da",
    phonetic_hint: "safe-sync-da",
    language_hint: "Tamil-English slang",
    input_type: "text",
  };

  nodeB.observePhrase(safetyPhrasePayload, NON_NORMAL_SAFETY_LABEL);
  nodeA.observePhrase(safetyPhrasePayload);

  const safetyBatch = nodeA.pullSyncBatch(nodeBCursor.cursor);
  const safetyImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: safetyBatch.cursor_before,
    cursorAfter: safetyBatch.cursor_after,
    packets: safetyBatch.packets,
  });

  const safetyPhrase = findPhrase(nodeB, safetyPhrasePayload.phrase_id);

  assertSimulation(
    safetyBatch.packet_count === 1,
    `Expected safety sync batch to contain 1 packet, got ${safetyBatch.packet_count}`
  );
  assertSimulation(
    safetyImport.accepted_new_count === 1,
    `Expected node B to accept 1 safety packet, got ${safetyImport.accepted_new_count}`
  );
  assertSimulation(
    safetyPhrase?.safety_label === NON_NORMAL_SAFETY_LABEL,
    `Expected safety label ${NON_NORMAL_SAFETY_LABEL} to survive normal phrase import, got ${safetyPhrase?.safety_label}`
  );

  console.log(
    `Safety label survival check succeeded with label ${NON_NORMAL_SAFETY_LABEL}.`
  );
}

runSimulation().catch((error) => {
  console.error("Two-node sync simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
