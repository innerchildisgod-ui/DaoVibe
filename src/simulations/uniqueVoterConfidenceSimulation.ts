import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { LanguageEngine } from "../engine";
import { MyceliumController } from "../mycelium/MyceliumController";
import type { LmpPacket } from "../protocol/packet";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "unique_voter_confidence_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "unique_voter_confidence_node_b.db");
const NODE_C_DB = path.join(DATA_DIR, "unique_voter_confidence_node_c.db");
const NODE_D_DB = path.join(DATA_DIR, "unique_voter_confidence_node_d.db");

const ZONE = "unique_voter_confidence_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_unique_voter_a";
const NODE_B_AUTHOR = "dev_public_key_unique_voter_b";
const NODE_C_AUTHOR = "dev_public_key_unique_voter_c";
const NODE_D_AUTHOR = "dev_public_key_unique_voter_d";

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

function receivePackets(engine: LanguageEngine, packets: LmpPacket[]): void {
  for (const packet of packets) {
    engine.receivePacket(packet);
  }
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);
  clearSqliteDatabase(NODE_C_DB);
  clearSqliteDatabase(NODE_D_DB);

  const nodeA = createEngine(NODE_A_AUTHOR, NODE_A_DB);
  const nodeB = createEngine(NODE_B_AUTHOR, NODE_B_DB);
  const nodeC = createEngine(NODE_C_AUTHOR, NODE_C_DB);
  const nodeD = createEngine(NODE_D_AUTHOR, NODE_D_DB);
  const controllerA = new MyceliumController(nodeA);

  const duplicateMeaningPhraseId = "unique_voter_meaning_duplicate_phrase";
  const duplicateMeaningId = "unique_voter_meaning_duplicate_target";
  const duplicatePhrase = nodeA.observePhrase({
    phrase_id: duplicateMeaningPhraseId,
    surface_text: "duplicate meaning voter",
    language_hint: "en",
    input_type: "text",
  });
  nodeA.proposeMeaning(
    {
      phrase_id: duplicateMeaningPhraseId,
      meaning_id: duplicateMeaningId,
      reference_meaning: "A meaning protected from duplicate votes.",
      confidence: 0,
    },
    duplicatePhrase.packet.packet_id
  );

  for (let index = 0; index < 3; index += 1) {
    nodeA.voteMeaning(
      {
        phrase_id: duplicateMeaningPhraseId,
        meaning_id: duplicateMeaningId,
        vote: "confirm",
        confidence: 1,
      },
      `duplicate-meaning-confirm-${index}`
    );
  }

  const duplicateMeaning = controllerA.getBestMeaning(
    duplicateMeaningPhraseId
  ).best_meaning;

  assertSimulation(
    duplicateMeaning?.confirms === 1,
    `Expected duplicate meaning confirms to count as 1, got ${duplicateMeaning?.confirms}`
  );
  assertSimulation(
    duplicateMeaning?.total_votes === 1,
    `Expected duplicate meaning total_votes to be 1, got ${duplicateMeaning?.total_votes}`
  );
  assertSimulation(
    (duplicateMeaning?.score ?? 1) < 0.5,
    `Expected duplicate meaning score below three-voter authority, got ${duplicateMeaning?.score}`
  );

  const uniqueMeaningPhraseId = "unique_voter_meaning_distinct_phrase";
  const uniqueMeaningId = "unique_voter_meaning_distinct_target";
  const uniquePhrase = nodeA.observePhrase({
    phrase_id: uniqueMeaningPhraseId,
    surface_text: "distinct meaning voters",
    language_hint: "en",
    input_type: "text",
  });
  const uniqueMeaning = nodeA.proposeMeaning(
    {
      phrase_id: uniqueMeaningPhraseId,
      meaning_id: uniqueMeaningId,
      reference_meaning: "A meaning with three independent voters.",
      confidence: 0,
    },
    uniquePhrase.packet.packet_id
  );

  const voterNodes = [nodeB, nodeC, nodeD];

  for (const voterNode of voterNodes) {
    receivePackets(voterNode, [uniquePhrase.packet, uniqueMeaning.packet]);
    const vote = voterNode.voteMeaning({
      phrase_id: uniqueMeaningPhraseId,
      meaning_id: uniqueMeaningId,
      vote: "confirm",
      confidence: 1,
    });
    nodeA.receivePacket(vote.packet);
  }

  const distinctMeaning = controllerA.getBestMeaning(
    uniqueMeaningPhraseId
  ).best_meaning;

  assertSimulation(
    distinctMeaning?.confirms === 3,
    `Expected distinct meaning confirms to count as 3, got ${distinctMeaning?.confirms}`
  );
  assertSimulation(
    distinctMeaning?.total_votes === 3,
    `Expected distinct meaning total_votes to be 3, got ${distinctMeaning?.total_votes}`
  );
  assertSimulation(
    distinctMeaning?.score === 0.5,
    `Expected distinct meaning score to reach full vote weight 0.5, got ${distinctMeaning?.score}`
  );

  const duplicateCorrectionPhraseId =
    "unique_voter_correction_duplicate_phrase";
  const duplicateCorrectionId = "unique_voter_correction_duplicate_target";
  const duplicateCorrection = controllerA.proposeMeaningCorrection({
    phrase_id: duplicateCorrectionPhraseId,
    original_meaning_id: "unique_voter_correction_duplicate_original",
    correction_id: duplicateCorrectionId,
    corrected_reference_meaning: "Duplicate correction voter target.",
  });

  for (let index = 0; index < 3; index += 1) {
    controllerA.voteMeaningCorrection(
      {
        phrase_id: duplicateCorrectionPhraseId,
        correction_id: duplicateCorrectionId,
        vote: "confirm",
        voter: "same_correction_voter",
      },
      `${duplicateCorrection.packet.packet_id}:same:${index}`
    );
  }

  const duplicateCorrectionSummary = controllerA
    .getPhraseCorrections(duplicateCorrectionPhraseId)
    .corrections.find(
      (correction) => correction.correction_id === duplicateCorrectionId
    );

  assertSimulation(
    duplicateCorrectionSummary?.confirm_votes === 1,
    `Expected duplicate correction confirms to count as 1, got ${duplicateCorrectionSummary?.confirm_votes}`
  );
  assertSimulation(
    duplicateCorrectionSummary?.status === "maturing",
    `Expected duplicate correction status maturing, got ${duplicateCorrectionSummary?.status}`
  );

  const distinctCorrectionId = "unique_voter_correction_distinct_target";
  const distinctCorrection = controllerA.proposeMeaningCorrection({
    phrase_id: duplicateCorrectionPhraseId,
    original_meaning_id: "unique_voter_correction_distinct_original",
    correction_id: distinctCorrectionId,
    corrected_reference_meaning: "Distinct correction voter target.",
  });

  ["correction_voter_a", "correction_voter_b", "correction_voter_c"].forEach(
    (voter, index) => {
      controllerA.voteMeaningCorrection(
        {
          phrase_id: duplicateCorrectionPhraseId,
          correction_id: distinctCorrectionId,
          vote: "confirm",
          voter,
        },
        `${distinctCorrection.packet.packet_id}:distinct:${index}`
      );
    }
  );

  const distinctCorrectionSummary = controllerA
    .getPhraseCorrections(duplicateCorrectionPhraseId)
    .corrections.find(
      (correction) => correction.correction_id === distinctCorrectionId
    );

  assertSimulation(
    distinctCorrectionSummary?.confirm_votes === 3,
    `Expected distinct correction confirms to count as 3, got ${distinctCorrectionSummary?.confirm_votes}`
  );
  assertSimulation(
    distinctCorrectionSummary?.status === "confirmed",
    `Expected distinct correction status confirmed, got ${distinctCorrectionSummary?.status}`
  );

  const latestCorrectionId = "unique_voter_correction_latest_target";
  const latestCorrection = controllerA.proposeMeaningCorrection({
    phrase_id: duplicateCorrectionPhraseId,
    original_meaning_id: "unique_voter_correction_latest_original",
    correction_id: latestCorrectionId,
    corrected_reference_meaning: "Latest correction vote target.",
  });

  controllerA.voteMeaningCorrection(
    {
      phrase_id: duplicateCorrectionPhraseId,
      correction_id: latestCorrectionId,
      vote: "reject",
      voter: "latest_correction_voter",
    },
    `${latestCorrection.packet.packet_id}:older-reject`
  );
  await delay(1100);
  controllerA.voteMeaningCorrection(
    {
      phrase_id: duplicateCorrectionPhraseId,
      correction_id: latestCorrectionId,
      vote: "confirm",
      voter: "latest_correction_voter",
    },
    `${latestCorrection.packet.packet_id}:newer-confirm`
  );

  const latestCorrectionSummary = controllerA
    .getPhraseCorrections(duplicateCorrectionPhraseId)
    .corrections.find(
      (correction) => correction.correction_id === latestCorrectionId
    );

  assertSimulation(
    latestCorrectionSummary?.confirm_votes === 1 &&
      latestCorrectionSummary.reject_votes === 0,
    `Expected latest correction vote to win, got confirms ${latestCorrectionSummary?.confirm_votes} rejects ${latestCorrectionSummary?.reject_votes}`
  );

  const tombstonePhraseId = "unique_voter_tombstone_phrase";
  const duplicateTombstoneId = "unique_voter_tombstone_duplicate_target";
  const duplicateTombstone = controllerA.proposeMeaningCorrectionTombstone({
    phrase_id: tombstonePhraseId,
    correction_id: duplicateCorrectionId,
    tombstone_id: duplicateTombstoneId,
    reason: "spam",
  });

  for (let index = 0; index < 3; index += 1) {
    controllerA.voteMeaningCorrectionTombstone(
      {
        phrase_id: tombstonePhraseId,
        correction_id: duplicateCorrectionId,
        tombstone_id: duplicateTombstoneId,
        vote: "confirm",
        voter: "same_tombstone_voter",
      },
      `${duplicateTombstone.packet.packet_id}:same:${index}`
    );
  }

  const duplicateTombstoneSummary = controllerA
    .getCorrectionTombstonesForPhrase(tombstonePhraseId)
    .tombstones.find(
      (tombstone) => tombstone.tombstone_id === duplicateTombstoneId
    );

  assertSimulation(
    duplicateTombstoneSummary?.confirm_votes === 1,
    `Expected duplicate tombstone confirms to count as 1, got ${duplicateTombstoneSummary?.confirm_votes}`
  );
  assertSimulation(
    duplicateTombstoneSummary?.status === "maturing",
    `Expected duplicate tombstone status maturing, got ${duplicateTombstoneSummary?.status}`
  );

  const distinctTombstoneId = "unique_voter_tombstone_distinct_target";
  const distinctTombstone = controllerA.proposeMeaningCorrectionTombstone({
    phrase_id: tombstonePhraseId,
    correction_id: distinctCorrectionId,
    tombstone_id: distinctTombstoneId,
    reason: "spam",
  });

  ["tombstone_voter_a", "tombstone_voter_b", "tombstone_voter_c"].forEach(
    (voter, index) => {
      controllerA.voteMeaningCorrectionTombstone(
        {
          phrase_id: tombstonePhraseId,
          correction_id: distinctCorrectionId,
          tombstone_id: distinctTombstoneId,
          vote: "confirm",
          voter,
        },
        `${distinctTombstone.packet.packet_id}:distinct:${index}`
      );
    }
  );

  const distinctTombstoneSummary = controllerA
    .getCorrectionTombstonesForPhrase(tombstonePhraseId)
    .tombstones.find(
      (tombstone) => tombstone.tombstone_id === distinctTombstoneId
    );

  assertSimulation(
    distinctTombstoneSummary?.confirm_votes === 3,
    `Expected distinct tombstone confirms to count as 3, got ${distinctTombstoneSummary?.confirm_votes}`
  );
  assertSimulation(
    distinctTombstoneSummary?.status === "confirmed",
    `Expected distinct tombstone status confirmed, got ${distinctTombstoneSummary?.status}`
  );

  console.log("meaning duplicate voter confidence counting passed");
  console.log("meaning distinct voter confidence counting passed");
  console.log("correction duplicate voter confidence counting passed");
  console.log("correction distinct voter confidence counting passed");
  console.log("correction conflicting latest-vote tie rule passed");
  console.log("tombstone duplicate voter confidence counting passed");
  console.log("tombstone distinct voter confidence counting passed");
  console.log("Unique voter confidence simulation succeeded.");
}

runSimulation().catch((error) => {
  console.error("Unique voter confidence simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
