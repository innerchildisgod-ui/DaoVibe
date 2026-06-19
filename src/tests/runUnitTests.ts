import assert from "assert";
import { createPacket } from "../protocol/packet";
import type { LmpPacket } from "../protocol/packet";
import { clampPhraseSearchLimit } from "../mycelium/PhraseLookup";
import {
  clampCorrectionHistoryLimit,
  selectCorrectionCleanupCandidates,
  summarizeCorrectionPacketsForPhrase,
} from "../mycelium/CorrectionLookup";
import { summarizeTombstonePacketsForPhrase } from "../mycelium/TombstoneLookup";
import { createCorrectionGovernanceRateLimiter } from "../server/routes/correctionRateLimiter";
import { test, runTests } from "./testHarness";
import { calculateMeaningScore } from "../mycelium/LanguageConfidence";

const TEST_ZONE = "unit_test_zone";
const TEST_AUTHOR = "unit_test_author";

function correctionPacketsWithVotes(args: {
  phraseId: string;
  correctionId: string;
  originalMeaningId?: string;
  confirmVotes?: number;
  rejectVotes?: number;
}): LmpPacket[] {
  const originalMeaningId =
    args.originalMeaningId ?? `${args.correctionId}_original_meaning`;
  const packets: LmpPacket[] = [
    createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: args.phraseId,
        original_meaning_id: originalMeaningId,
        correction_id: args.correctionId,
        corrected_reference_meaning: "Corrected meaning.",
      },
    }),
  ];

  for (let index = 0; index < (args.confirmVotes ?? 0); index += 1) {
    packets.push(
      createPacket({
        packet_type: "meaning_correction_vote",
        zone: TEST_ZONE,
        author: TEST_AUTHOR,
        payload: {
          phrase_id: args.phraseId,
          correction_id: args.correctionId,
          vote: "confirm",
          voter: `${args.correctionId}_confirm_voter_${index}`,
        },
      })
    );
  }

  for (let index = 0; index < (args.rejectVotes ?? 0); index += 1) {
    packets.push(
      createPacket({
        packet_type: "meaning_correction_vote",
        zone: TEST_ZONE,
        author: TEST_AUTHOR,
        payload: {
          phrase_id: args.phraseId,
          correction_id: args.correctionId,
          vote: "reject",
          voter: `${args.correctionId}_reject_voter_${index}`,
        },
      })
    );
  }

  return packets;
}

function tombstonePacketsWithVotes(args: {
  phraseId: string;
  correctionId: string;
  tombstoneId: string;
  confirmVotes?: number;
  rejectVotes?: number;
  proposedAt?: number;
}): LmpPacket[] {
  const proposal = createPacket({
    packet_type: "meaning_correction_tombstone_proposed",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload: {
      phrase_id: args.phraseId,
      correction_id: args.correctionId,
      tombstone_id: args.tombstoneId,
      reason: "negative_score",
    },
  });

  if (args.proposedAt !== undefined) {
    proposal.created_at = args.proposedAt;
  }

  const packets: LmpPacket[] = [proposal];

  for (let index = 0; index < (args.confirmVotes ?? 0); index += 1) {
    packets.push(
      createPacket({
        packet_type: "meaning_correction_tombstone_vote",
        zone: TEST_ZONE,
        author: TEST_AUTHOR,
        payload: {
          phrase_id: args.phraseId,
          correction_id: args.correctionId,
          tombstone_id: args.tombstoneId,
          vote: "confirm",
          voter: `${args.tombstoneId}_confirm_voter_${index}`,
        },
      })
    );
  }

  for (let index = 0; index < (args.rejectVotes ?? 0); index += 1) {
    packets.push(
      createPacket({
        packet_type: "meaning_correction_tombstone_vote",
        zone: TEST_ZONE,
        author: TEST_AUTHOR,
        payload: {
          phrase_id: args.phraseId,
          correction_id: args.correctionId,
          tombstone_id: args.tombstoneId,
          vote: "reject",
          voter: `${args.tombstoneId}_reject_voter_${index}`,
        },
      })
    );
  }

  return packets;
}

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

test("correction governance rate limiter uses fixed IP windows", () => {
  let now = 1_000;
  const limiter = createCorrectionGovernanceRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });

  assert.strictEqual(limiter.allow("192.0.2.10"), true);
  assert.strictEqual(limiter.allow("192.0.2.10"), true);
  assert.strictEqual(limiter.allow("192.0.2.10"), false);
  assert.strictEqual(limiter.allow("192.0.2.11"), true);

  now = 2_000;

  assert.strictEqual(limiter.allow("192.0.2.10"), true);
  assert.strictEqual(limiter.allow(undefined), true);
  assert.strictEqual(limiter.allow(undefined), true);
  assert.strictEqual(limiter.allow(undefined), false);
});

test("correction tombstone summaries use maturity statuses", () => {
  const cases = [
    { confirmVotes: 0, rejectVotes: 0, status: "pending" },
    { confirmVotes: 1, rejectVotes: 0, status: "maturing" },
    { confirmVotes: 3, rejectVotes: 0, status: "confirmed" },
    { confirmVotes: 0, rejectVotes: 1, status: "maturing" },
    { confirmVotes: 0, rejectVotes: 3, status: "rejected" },
    { confirmVotes: 1, rejectVotes: 1, status: "contested" },
  ];

  for (const testCase of cases) {
    const phraseId = `unit_phrase_tombstone_status_${testCase.confirmVotes}_${testCase.rejectVotes}`;
    const tombstoneId = `unit_tombstone_status_${testCase.confirmVotes}_${testCase.rejectVotes}`;
    const summaries = summarizeTombstonePacketsForPhrase(
      phraseId,
      tombstonePacketsWithVotes({
        phraseId,
        correctionId: "unit_correction_tombstone_status",
        tombstoneId,
        confirmVotes: testCase.confirmVotes,
        rejectVotes: testCase.rejectVotes,
      })
    );

    assert.strictEqual(summaries.length, 1);
    assert.strictEqual(summaries[0].status, testCase.status);
  }
});

test("correction tombstone duplicate voter protection counts earliest vote", () => {
  const phraseId = "unit_phrase_tombstone_duplicate_votes";
  const correctionId = "unit_correction_tombstone_duplicate_votes";
  const tombstoneId = "unit_tombstone_duplicate_votes";
  const packets: LmpPacket[] = [
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId,
    }),
    createPacket({
      packet_type: "meaning_correction_tombstone_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        tombstone_id: tombstoneId,
        vote: "confirm",
        voter: "same_tombstone_voter",
      },
    }),
    createPacket({
      packet_type: "meaning_correction_tombstone_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        tombstone_id: tombstoneId,
        vote: "reject",
        voter: "same_tombstone_voter",
      },
    }),
  ];

  const summaries = summarizeTombstonePacketsForPhrase(phraseId, packets);

  assert.strictEqual(summaries.length, 1);
  assert.strictEqual(summaries[0].confirm_votes, 1);
  assert.strictEqual(summaries[0].reject_votes, 0);
  assert.strictEqual(summaries[0].tombstone_score, 1);
  assert.strictEqual(summaries[0].status, "maturing");
});

test("correction tombstone summaries sort deterministically", () => {
  const phraseId = "unit_phrase_tombstone_sorting";
  const correctionId = "unit_correction_tombstone_sorting";
  const packets: LmpPacket[] = [
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "sort_alpha",
      confirmVotes: 1,
      proposedAt: 400,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "sort_beta",
      confirmVotes: 1,
      proposedAt: 400,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "sort_high_score",
      confirmVotes: 3,
      proposedAt: 300,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "sort_more_confirms",
      confirmVotes: 2,
      rejectVotes: 1,
      proposedAt: 200,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "sort_early",
      confirmVotes: 1,
      proposedAt: 100,
    }),
  ];

  const summaries = summarizeTombstonePacketsForPhrase(phraseId, packets);

  assert.deepStrictEqual(
    summaries.map((summary) => summary.tombstone_id),
    [
      "sort_high_score",
      "sort_more_confirms",
      "sort_early",
      "sort_alpha",
      "sort_beta",
    ]
  );
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
  assert.strictEqual(corrections[0].status, "maturing");
});

test("correction status requires maturity threshold", () => {
  const cases = [
    { confirmVotes: 1, rejectVotes: 0, status: "maturing" },
    { confirmVotes: 2, rejectVotes: 0, status: "maturing" },
    { confirmVotes: 3, rejectVotes: 0, status: "confirmed" },
    { confirmVotes: 0, rejectVotes: 1, status: "maturing" },
    { confirmVotes: 0, rejectVotes: 2, status: "maturing" },
    { confirmVotes: 0, rejectVotes: 3, status: "rejected" },
    { confirmVotes: 1, rejectVotes: 1, status: "contested" },
  ];

  for (const testCase of cases) {
    const phraseId = `unit_phrase_status_${testCase.confirmVotes}_${testCase.rejectVotes}`;
    const correctionId = `unit_correction_status_${testCase.confirmVotes}_${testCase.rejectVotes}`;
    const corrections = summarizeCorrectionPacketsForPhrase(
      phraseId,
      correctionPacketsWithVotes({
        phraseId,
        correctionId,
        confirmVotes: testCase.confirmVotes,
        rejectVotes: testCase.rejectVotes,
      })
    );

    assert.strictEqual(corrections.length, 1);
    assert.strictEqual(corrections[0].status, testCase.status);
  }
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

test("weak negative correction is not a cleanup candidate", () => {
  const phraseId = "unit_phrase_weak_negative_cleanup";
  const correctionId = "unit_correction_weak_negative_cleanup";
  const corrections = summarizeCorrectionPacketsForPhrase(
    phraseId,
    correctionPacketsWithVotes({
      phraseId,
      correctionId,
      rejectVotes: 1,
    })
  );
  const candidates = selectCorrectionCleanupCandidates(corrections);

  assert.strictEqual(corrections.length, 1);
  assert.strictEqual(corrections[0].status, "maturing");
  assert.strictEqual(candidates.length, 0);
});

test("mature rejected correction is a cleanup candidate", () => {
  const phraseId = "unit_phrase_mature_rejected_cleanup";
  const correctionId = "unit_correction_mature_rejected_cleanup";
  const corrections = summarizeCorrectionPacketsForPhrase(
    phraseId,
    correctionPacketsWithVotes({
      phraseId,
      correctionId,
      rejectVotes: 3,
    })
  );
  const candidates = selectCorrectionCleanupCandidates(corrections);

  assert.strictEqual(corrections.length, 1);
  assert.strictEqual(corrections[0].status, "rejected");
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].correction_id, correctionId);
  assert.deepStrictEqual(candidates[0].cleanup_reasons, [
    "rejected_status",
    "negative_score",
  ]);
});

test("cleanup candidates include mature losing conflict corrections", () => {
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
    createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: losingCorrectionId,
        vote: "reject",
        voter: "voter_3",
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
        voter: "voter_4",
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


test("language confidence clamps invalid confidence and vote counts", () => {
  const score = calculateMeaningScore({
    confidence: 2,
    confirms: 1.9,
    rejects: -5,
  });

  assert.strictEqual(score.confidence, 1);
  assert.strictEqual(score.confirms, 1);
  assert.strictEqual(score.rejects, 0);
  assert.strictEqual(score.total_votes, 1);
  assert(score.score <= 1);
});

test("language confidence gives weak weight to a single vote", () => {
  const score = calculateMeaningScore({
    confidence: 0.25,
    confirms: 1,
    rejects: 0,
  });

  assert(score.score > 0.25);
  assert(score.score < 0.75);
});

test("language confidence penalizes rejected meanings", () => {
  const score = calculateMeaningScore({
    confidence: 0.5,
    confirms: 0,
    rejects: 3,
  });

  assert(score.score < 0.5);
});

void runTests();

