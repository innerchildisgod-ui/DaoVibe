import assert from "assert";
import { createPacket } from "../protocol/packet";
import { clampPhraseSearchLimit } from "../mycelium/PhraseLookup";
import {
  clampCorrectionHistoryLimit,
  selectCorrectionCleanupCandidates,
  summarizeCorrectionPacketsForPhrase,
} from "../mycelium/CorrectionLookup";
import { test, runTests } from "./testHarness";

const TEST_ZONE = "unit_test_zone";
const TEST_AUTHOR = "unit_test_author";

test("clampPhraseSearchLimit uses defaults and bounds", () => {
  assert.strictEqual(clampPhraseSearchLimit(undefined), 25);
  assert.strictEqual(clampPhraseSearchLimit(0), 1);
  assert.strictEqual(clampPhraseSearchLimit(500), 100);
  assert.strictEqual(clampPhraseSearchLimit(12.9), 12);
});

test("clampCorrectionHistoryLimit uses defaults and bounds", () => {
  assert.strictEqual(clampCorrectionHistoryLimit(undefined), 100);
  assert.strictEqual(clampCorrectionHistoryLimit(0), 1);
  assert.strictEqual(clampCorrectionHistoryLimit(999), 500);
  assert.strictEqual(clampCorrectionHistoryLimit(12.9), 12);
});

test("correction voter duplicate protection counts first identified voter vote only", () => {
  const phraseId = "unit_phrase_duplicate_votes";
  const correctionId = "unit_correction_duplicate_votes";

  const packets = [
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: "unit_original_meaning_duplicate_votes",
        correction_id: correctionId,
        corrected_reference_meaning: "Corrected meaning.",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        vote: "confirm",
        voter: "same_voter",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        vote: "reject",
        voter: "same_voter",
      },
    }),
  ];

  const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);

  assert.strictEqual(corrections.length, 1);
  assert.strictEqual(corrections[0].confirm_votes, 1);
  assert.strictEqual(corrections[0].reject_votes, 0);
  assert.strictEqual(corrections[0].correction_score, 1);
  assert.strictEqual(corrections[0].status, "confirmed");
});

test("correction conflict ranking chooses higher score first", () => {
  const phraseId = "unit_phrase_conflict_ranking";
  const originalMeaningId = "unit_original_meaning_conflict_ranking";
  const strongerCorrectionId = "unit_correction_stronger";
  const weakerCorrectionId = "unit_correction_weaker";

  const packets = [
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: weakerCorrectionId,
        corrected_reference_meaning: "Weaker correction.",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: strongerCorrectionId,
        corrected_reference_meaning: "Stronger correction.",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: strongerCorrectionId,
        vote: "confirm",
        voter: "voter_1",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: strongerCorrectionId,
        vote: "confirm",
        voter: "voter_2",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: weakerCorrectionId,
        vote: "reject",
        voter: "voter_3",
      },
    }),
  ];

  const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);

  assert.strictEqual(corrections.length, 2);
  assert.strictEqual(corrections[0].correction_id, strongerCorrectionId);
  assert.strictEqual(corrections[0].conflict_rank, 1);
  assert.strictEqual(corrections[0].is_conflicting, true);
  assert.strictEqual(corrections[1].correction_id, weakerCorrectionId);
  assert.strictEqual(corrections[1].conflict_rank, 2);
  assert.strictEqual(corrections[1].is_conflicting, true);
});

test("cleanup candidates include rejected and losing negative conflict corrections", () => {
  const phraseId = "unit_phrase_cleanup_candidates";
  const originalMeaningId = "unit_original_meaning_cleanup_candidates";
  const winningCorrectionId = "unit_cleanup_winner";
  const losingCorrectionId = "unit_cleanup_loser";

  const packets = [
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: winningCorrectionId,
        corrected_reference_meaning: "Winning correction.",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: losingCorrectionId,
        corrected_reference_meaning: "Losing correction.",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: winningCorrectionId,
        vote: "confirm",
        voter: "voter_1",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: losingCorrectionId,
        vote: "reject",
        voter: "voter_2",
      },
    }),
  ];

  const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);
  const candidates = selectCorrectionCleanupCandidates(corrections);

  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].correction_id, losingCorrectionId);
  assert.deepStrictEqual(candidates[0].cleanup_reasons, [
    "rejected_status",
    "negative_score",
    "losing_conflict_candidate",
  ]);
});

void runTests();
