import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { MyceliumController } from "../mycelium/MyceliumController";
import { createPacket } from "../protocol/packet";
import type { PacketType, PhraseObservedPayload } from "../protocol/packetTypes";
import { SafetyLabel } from "../safety/safetyLabels";
import type { SyncResultSummary } from "../sync/SyncResultSummary";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "two_node_sync_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "two_node_sync_node_b.db");

const ZONE = "two_node_sync_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_two_node_a";
const NODE_B_AUTHOR = "dev_public_key_two_node_b";

const NON_NORMAL_SAFETY_LABEL: SafetyLabel | undefined = "mild_slang";
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

function assertSyncSummaryFields(summary: SyncResultSummary): void {
  for (const field of SYNC_SUMMARY_FIELDS) {
    assertSimulation(
      typeof summary[field] === "number",
      `Expected sync summary field ${field} to be present as a number`
    );
  }
}

function assertStoredPacketTypes(
  engine: LanguageEngine,
  expectedPackets: Array<{ packetId: string; packetType: PacketType }>
): void {
  const storedPackets = engine.getPacketsByIds(
    expectedPackets.map((packet) => packet.packetId)
  );
  const storedById = new Map(
    storedPackets.map((packet) => [packet.packet_id, packet])
  );

  for (const expectedPacket of expectedPackets) {
    const storedPacket = storedById.get(expectedPacket.packetId);

    assertSimulation(
      storedPacket?.packet_type === expectedPacket.packetType,
      `Expected node B to store ${expectedPacket.packetType} packet ${expectedPacket.packetId}`
    );
  }
}

function assertPacketResultStatus(
  results: Array<{ packet_id: string; status: string }>,
  packetId: string,
  expectedStatus: string
): void {
  const result = results.find((candidate) => candidate.packet_id === packetId);

  assertSimulation(
    result?.status === expectedStatus,
    `Expected packet ${packetId} to have sync status ${expectedStatus}, got ${result?.status}`
  );
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

  const expiredPhrasePayload: PhraseObservedPayload = {
    phrase_id: "two_node_sync_expired_phrase_001",
    surface_text: "expired sync ah?",
    phonetic_hint: "expired-sync-aa",
    language_hint: "Tamil-English slang",
    input_type: "text",
  };
  const expiredPacket = createPacket({
    packet_type: "phrase_observed",
    zone: ZONE,
    author: NODE_A_AUTHOR,
    payload: expiredPhrasePayload,
    expires_at: Math.floor(Date.now() / 1000) - 1,
  });
  const expiredCursorBefore = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;
  let expiredRejected = false;

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: expiredCursorBefore,
      cursorAfter: `${expiredPacket.created_at}:${expiredPacket.packet_id}`,
      packets: [expiredPacket],
    });
  } catch {
    expiredRejected = true;
  }

  assertSimulation(expiredRejected, "Expected expired packet import to fail");
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === expiredCursorBefore,
    "Expected expired packet import to leave node B cursor unchanged"
  );
  assertSimulation(
    nodeB.getPacketsByIds([expiredPacket.packet_id]).length === 0,
    "Expected node B not to store expired packet"
  );
  assertSimulation(
    findPhrase(nodeB, expiredPhrasePayload.phrase_id) === undefined,
    `Expected node B knowledge not to contain ${expiredPhrasePayload.phrase_id}`
  );

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
    firstImport.summary.accepted_new === 1,
    `Expected node B to accept 1 new packet, got ${firstImport.summary.accepted_new}`
  );
  assertSimulation(
    importedPhrase !== undefined,
    `Node B knowledge is missing phrase ${phrasePayload.phrase_id}`
  );

  const nodeBCursor = nodeB.getPeerSyncCursor(NODE_A_AUTHOR);
  const restartedNodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);
  const restartedPhrase = findPhrase(restartedNodeB, phrasePayload.phrase_id);
  const restartedPackets = restartedNodeB.getPacketsByIds([
    phraseResult.packet.packet_id,
  ]);
  const restartedCursor = restartedNodeB.getPeerSyncCursor(NODE_A_AUTHOR);
  const secondBatch = nodeA.pullSyncBatch(restartedCursor.cursor);

  assertSimulation(
    restartedPhrase !== undefined,
    `Restarted node B knowledge is missing phrase ${phrasePayload.phrase_id}`
  );
  assertSimulation(
    restartedPackets.length === 1,
    `Restarted node B is missing imported packet ${phraseResult.packet.packet_id}`
  );
  assertSimulation(
    restartedCursor.cursor === nodeBCursor.cursor,
    `Restarted node B cursor mismatch. Expected ${nodeBCursor.cursor}, got ${restartedCursor.cursor}`
  );

  assertSimulation(
    secondBatch.packet_count === 0,
    `Expected second sync batch to contain 0 packets, got ${secondBatch.packet_count}`
  );

  console.log(
    `success sync passed: ${phrasePayload.phrase_id} imported from packet ${phraseResult.packet.packet_id}`
  );
  console.log("restart persistence passed");
  console.log("duplicate/cursor check passed");

  if (!NON_NORMAL_SAFETY_LABEL) {
    console.log("Safety label survival check skipped: no non-normal label exists.");
  } else {
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
      safetyImport.summary.accepted_new === 1,
      `Expected node B to accept 1 safety packet, got ${safetyImport.summary.accepted_new}`
    );
    assertSimulation(
      safetyPhrase?.safety_label === NON_NORMAL_SAFETY_LABEL,
      `Expected safety label ${NON_NORMAL_SAFETY_LABEL} to survive normal phrase import, got ${safetyPhrase?.safety_label}`
    );

    console.log(`safety label survival passed: ${NON_NORMAL_SAFETY_LABEL}`);
  }

  await delay(1100);

  const correctionOriginalMeaningId = "two_node_sync_original_meaning_001";
  const correctionId = "two_node_sync_correction_001";
  const correctionMeaningResult = nodeA.proposeMeaning(
    {
      phrase_id: phrasePayload.phrase_id,
      meaning_id: correctionOriginalMeaningId,
      reference_meaning: "A rough meaning before correction.",
      context: "two-node correction sync baseline",
      confidence: 0.25,
    },
    phraseResult.packet.packet_id
  );
  const correctionProposalResult = nodeA.proposeMeaningCorrection(
    {
      phrase_id: phrasePayload.phrase_id,
      original_meaning_id: correctionOriginalMeaningId,
      correction_id: correctionId,
      corrected_reference_meaning:
        "A corrected meaning synced through correction packets.",
      correction_context: "two-node correction sync verification",
      source: "two-node-sync-simulation",
    },
    correctionMeaningResult.packet.packet_id
  );
  const correctionVoteResult = nodeA.voteMeaningCorrection(
    {
      phrase_id: phrasePayload.phrase_id,
      correction_id: correctionId,
      vote: "confirm",
      voter: NODE_A_AUTHOR,
    },
    correctionProposalResult.packet.packet_id
  );

  const correctionCursorBefore = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;
  const correctionBatch = nodeA.pullSyncBatch(correctionCursorBefore);
  const correctionImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: correctionBatch.cursor_before,
    cursorAfter: correctionBatch.cursor_after,
    packets: correctionBatch.packets,
  });

  assertSyncSummaryFields(correctionImport.summary);
  assertSimulation(
    correctionBatch.packet_count === 3,
    `Expected correction sync batch to contain 3 packets, got ${correctionBatch.packet_count}`
  );
  assertSimulation(
    correctionImport.summary.accepted_new === 3,
    `Expected node B to accept 3 correction-flow packets, got ${correctionImport.summary.accepted_new}`
  );
  assertSimulation(
    correctionImport.summary.already_stored === 0 &&
      correctionImport.summary.rejected_invalid === 0 &&
      correctionImport.summary.rejected_expired === 0 &&
      correctionImport.summary.failed_apply === 0,
    `Expected correction sync to have no duplicate or failed packets, got ${JSON.stringify(correctionImport.summary)}`
  );
  assertStoredPacketTypes(nodeB, [
    {
      packetId: correctionProposalResult.packet.packet_id,
      packetType: "meaning_correction_proposed",
    },
    {
      packetId: correctionVoteResult.packet.packet_id,
      packetType: "meaning_correction_vote",
    },
  ]);
  assertPacketResultStatus(
    correctionImport.results,
    correctionProposalResult.packet.packet_id,
    "accepted_new"
  );
  assertPacketResultStatus(
    correctionImport.results,
    correctionVoteResult.packet.packet_id,
    "accepted_new"
  );

  const duplicateCorrectionCursor = nodeB.getPeerSyncCursor(
    NODE_A_AUTHOR
  ).cursor;
  const duplicateCorrectionImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: duplicateCorrectionCursor,
    cursorAfter: duplicateCorrectionCursor,
    packets: [
      correctionProposalResult.packet,
      correctionVoteResult.packet,
    ],
  });

  assertSyncSummaryFields(duplicateCorrectionImport.summary);
  assertSimulation(
    duplicateCorrectionImport.summary.accepted_new === 0,
    `Expected duplicate correction sync to accept 0 new packets, got ${duplicateCorrectionImport.summary.accepted_new}`
  );
  assertSimulation(
    duplicateCorrectionImport.summary.already_stored === 2,
    `Expected duplicate correction sync to report 2 already stored packets, got ${duplicateCorrectionImport.summary.already_stored}`
  );
  assertSimulation(
    duplicateCorrectionImport.summary.rejected_invalid === 0 &&
      duplicateCorrectionImport.summary.rejected_expired === 0 &&
      duplicateCorrectionImport.summary.failed_apply === 0,
    `Expected duplicate correction sync to have no rejected or failed packets, got ${JSON.stringify(duplicateCorrectionImport.summary)}`
  );
  assertPacketResultStatus(
    duplicateCorrectionImport.results,
    correctionProposalResult.packet.packet_id,
    "already_stored"
  );
  assertPacketResultStatus(
    duplicateCorrectionImport.results,
    correctionVoteResult.packet.packet_id,
    "already_stored"
  );

  const nodeBBestMeaning = new MyceliumController(nodeB).getBestMeaning(
    phrasePayload.phrase_id
  );

  assertSimulation(
    nodeBBestMeaning.best_meaning?.source === "correction",
    `Expected node B best meaning to use synced correction, got ${nodeBBestMeaning.best_meaning?.source ?? "base meaning"}`
  );
  assertSimulation(
    nodeBBestMeaning.best_meaning?.correction_id === correctionId,
    `Expected node B best meaning correction ${correctionId}, got ${nodeBBestMeaning.best_meaning?.correction_id}`
  );
  assertSimulation(
    nodeBBestMeaning.best_meaning?.correction_score === 1,
    `Expected node B synced correction score to be 1, got ${nodeBBestMeaning.best_meaning?.correction_score}`
  );

  console.log("correction packet sync passed");
  console.log("correction duplicate protection passed");
  console.log("synced correction best meaning passed");


  await delay(1100);

  const tombstoneId = "two_node_sync_correction_tombstone_001";
  const tombstoneProposalResult = nodeA.proposeMeaningCorrectionTombstone(
    {
      phrase_id: phrasePayload.phrase_id,
      correction_id: correctionId,
      tombstone_id: tombstoneId,
      reason: "negative_score",
      details: "two-node tombstone sync verification",
      proposer: NODE_A_AUTHOR,
    },
    correctionVoteResult.packet.packet_id
  );
  const tombstoneVoteResults = [1, 2, 3].map((index) =>
    nodeA.voteMeaningCorrectionTombstone(
      {
        phrase_id: phrasePayload.phrase_id,
        correction_id: correctionId,
        tombstone_id: tombstoneId,
        vote: "confirm",
        voter: `${NODE_A_AUTHOR}_tombstone_voter_${index}`,
      },
      index === 1
        ? tombstoneProposalResult.packet.packet_id
        : undefined
    )
  );

  const tombstoneCursorBefore = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;
  const tombstoneBatch = nodeA.pullSyncBatch(tombstoneCursorBefore);
  const tombstoneImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: tombstoneBatch.cursor_before,
    cursorAfter: tombstoneBatch.cursor_after,
    packets: tombstoneBatch.packets,
  });

  assertSyncSummaryFields(tombstoneImport.summary);
  assertSimulation(
    tombstoneBatch.packet_count === 4,
    `Expected tombstone sync batch to contain 4 packets, got ${tombstoneBatch.packet_count}`
  );
  assertSimulation(
    tombstoneImport.summary.accepted_new === 4,
    `Expected node B to accept 4 tombstone packets, got ${tombstoneImport.summary.accepted_new}`
  );
  assertSimulation(
    tombstoneImport.summary.already_stored === 0 &&
      tombstoneImport.summary.rejected_invalid === 0 &&
      tombstoneImport.summary.rejected_expired === 0 &&
      tombstoneImport.summary.failed_apply === 0,
    `Expected tombstone sync to have no duplicate or failed packets, got ${JSON.stringify(tombstoneImport.summary)}`
  );
  assertStoredPacketTypes(nodeB, [
    {
      packetId: tombstoneProposalResult.packet.packet_id,
      packetType: "meaning_correction_tombstone_proposed",
    },
    ...tombstoneVoteResults.map((result) => ({
      packetId: result.packet.packet_id,
      packetType: "meaning_correction_tombstone_vote" as const,
    })),
  ]);
  assertPacketResultStatus(
    tombstoneImport.results,
    tombstoneProposalResult.packet.packet_id,
    "accepted_new"
  );
  for (const tombstoneVoteResult of tombstoneVoteResults) {
    assertPacketResultStatus(
      tombstoneImport.results,
      tombstoneVoteResult.packet.packet_id,
      "accepted_new"
    );
  }

  const nodeBControllerAfterTombstone = new MyceliumController(nodeB);
  const nodeBTombstones =
    nodeBControllerAfterTombstone.getCorrectionTombstonesForPhrase(
      phrasePayload.phrase_id
    );
  const nodeBTombstone = nodeBTombstones.tombstones.find(
    (candidate) => candidate.tombstone_id === tombstoneId
  );

  assertSimulation(
    nodeBTombstones.phrase_id === phrasePayload.phrase_id,
    `Expected node B tombstone lookup phrase ${phrasePayload.phrase_id}, got ${nodeBTombstones.phrase_id}`
  );
  assertSimulation(
    nodeBTombstone !== undefined,
    `Expected node B tombstone lookup to include tombstone ${tombstoneId}`
  );
  assertSimulation(
    nodeBTombstone?.correction_id === correctionId,
    `Expected node B tombstone correction ${correctionId}, got ${nodeBTombstone?.correction_id}`
  );
  assertSimulation(
    (nodeBTombstone?.confirm_votes ?? 0) >= 3,
    `Expected confirmed tombstone to have at least 3 confirms, got ${nodeBTombstone?.confirm_votes}`
  );
  assertSimulation(
    nodeBTombstone?.reject_votes === 0,
    `Expected confirmed tombstone to have 0 rejects, got ${nodeBTombstone?.reject_votes}`
  );
  assertSimulation(
    (nodeBTombstone?.tombstone_score ?? 0) >= 3,
    `Expected confirmed tombstone score to be at least 3, got ${nodeBTombstone?.tombstone_score}`
  );
  assertSimulation(
    nodeBTombstone?.status === "confirmed",
    `Expected node B tombstone status confirmed, got ${nodeBTombstone?.status}`
  );

  const nodeBPreview =
    nodeBControllerAfterTombstone.getTombstoneExecutionPreviewForPhrase(
      phrasePayload.phrase_id
    );
  const suppressedCorrection = nodeBPreview.suppressed_corrections.find(
    (candidate) => candidate.correction_id === correctionId
  );

  assertSimulation(
    nodeBPreview.execution_enabled === false,
    "Expected tombstone execution preview to remain disabled"
  );
  assertSimulation(
    nodeBPreview.suppressed_count === 1,
    `Expected tombstone execution preview suppressed_count 1, got ${nodeBPreview.suppressed_count}`
  );
  assertSimulation(
    nodeBPreview.active_count === 0,
    `Expected tombstone execution preview active_count 0, got ${nodeBPreview.active_count}`
  );
  assertSimulation(
    suppressedCorrection?.tombstone_id === tombstoneId,
    `Expected preview to suppress correction ${correctionId} with tombstone ${tombstoneId}`
  );
  assertSimulation(
    suppressedCorrection?.tombstone_status === "confirmed",
    `Expected preview tombstone status confirmed, got ${suppressedCorrection?.tombstone_status}`
  );
  assertSimulation(
    (suppressedCorrection?.tombstone_score ?? 0) >= 3,
    `Expected preview tombstone score at least 3, got ${suppressedCorrection?.tombstone_score}`
  );

  const nodeBBestMeaningAfterTombstone =
    nodeBControllerAfterTombstone.getBestMeaning(phrasePayload.phrase_id);

  assertSimulation(
    nodeBBestMeaningAfterTombstone.best_meaning?.source === "correction",
    `Expected tombstone preview not to suppress live bestMeaning, got ${nodeBBestMeaningAfterTombstone.best_meaning?.source ?? "base meaning"}`
  );
  assertSimulation(
    nodeBBestMeaningAfterTombstone.best_meaning?.correction_id === correctionId,
    `Expected live bestMeaning correction ${correctionId} after tombstone preview, got ${nodeBBestMeaningAfterTombstone.best_meaning?.correction_id}`
  );

  const duplicateTombstoneCursor = nodeB.getPeerSyncCursor(
    NODE_A_AUTHOR
  ).cursor;
  const duplicateTombstoneImport = nodeB.importSyncBatch({
    peerAuthor: NODE_A_AUTHOR,
    cursorBefore: duplicateTombstoneCursor,
    cursorAfter: duplicateTombstoneCursor,
    packets: [
      tombstoneProposalResult.packet,
      ...tombstoneVoteResults.map((result) => result.packet),
    ],
  });

  assertSyncSummaryFields(duplicateTombstoneImport.summary);
  assertSimulation(
    duplicateTombstoneImport.summary.accepted_new === 0,
    `Expected duplicate tombstone sync to accept 0 new packets, got ${duplicateTombstoneImport.summary.accepted_new}`
  );
  assertSimulation(
    duplicateTombstoneImport.summary.already_stored === 4,
    `Expected duplicate tombstone sync to report 4 already stored packets, got ${duplicateTombstoneImport.summary.already_stored}`
  );
  assertSimulation(
    duplicateTombstoneImport.summary.rejected_invalid === 0 &&
      duplicateTombstoneImport.summary.rejected_expired === 0 &&
      duplicateTombstoneImport.summary.failed_apply === 0,
    `Expected duplicate tombstone sync to have no rejected or failed packets, got ${JSON.stringify(duplicateTombstoneImport.summary)}`
  );
  assertPacketResultStatus(
    duplicateTombstoneImport.results,
    tombstoneProposalResult.packet.packet_id,
    "already_stored"
  );
  for (const tombstoneVoteResult of tombstoneVoteResults) {
    assertPacketResultStatus(
      duplicateTombstoneImport.results,
      tombstoneVoteResult.packet.packet_id,
      "already_stored"
    );
  }

  console.log("correction tombstone packet sync passed");
  console.log("correction tombstone duplicate protection passed");
  console.log("correction tombstone inspection preview sync passed");

  const corruptCursorBefore = nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor;
  const corruptPhrasePayload: PhraseObservedPayload = {
    phrase_id: "two_node_sync_corrupt_phrase_001",
    surface_text: "corrupt sync ah?",
    phonetic_hint: "corrupt-sync-aa",
    language_hint: "Tamil-English slang",
    input_type: "speech",
  };

  await delay(1100);
  nodeA.observePhrase(corruptPhrasePayload);

  const corruptBatch = nodeA.pullSyncBatch(corruptCursorBefore);

  assertSimulation(
    corruptBatch.packet_count === 1,
    `Expected corrupt test sync batch to contain 1 packet, got ${corruptBatch.packet_count}`
  );

  const originalPacket = corruptBatch.packets[0];
  const corruptedPacket = {
    ...originalPacket,
    payload: {
      ...(originalPacket.payload as PhraseObservedPayload),
      surface_text: "tampered without rehashing",
    },
  };
  let corruptedRejected = false;

  try {
    nodeB.importSyncBatch({
      peerAuthor: NODE_A_AUTHOR,
      cursorBefore: corruptBatch.cursor_before,
      cursorAfter: corruptBatch.cursor_after,
      packets: [corruptedPacket],
    });
  } catch {
    corruptedRejected = true;
  }

  assertSimulation(corruptedRejected, "Expected corrupted packet import to fail");
  assertSimulation(
    nodeB.getPeerSyncCursor(NODE_A_AUTHOR).cursor === corruptCursorBefore,
    "Expected corrupted packet import to leave node B cursor unchanged"
  );
  assertSimulation(
    nodeB.getPacketsByIds([corruptedPacket.packet_id]).length === 0,
    "Expected node B not to store corrupted packet"
  );
  assertSimulation(
    findPhrase(nodeB, corruptPhrasePayload.phrase_id) === undefined,
    `Expected node B knowledge not to contain ${corruptPhrasePayload.phrase_id}`
  );

  console.log("corrupted packet rejection passed");
  console.log("expired packet rejection passed");
  console.log("Two-node sync simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Two-node sync simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

