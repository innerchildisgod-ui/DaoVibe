import assert from "assert";
import { join } from "path";
import { createPacket } from "../protocol/packet";
import type { LmpPacket } from "../protocol/packet";
import { clampPhraseSearchLimit } from "../mycelium/PhraseLookup";
import {
  clampCorrectionHistoryLimit,
  type CorrectionSummary,
  selectCorrectionCleanupCandidates,
  summarizeCorrectionPacketsForPhrase,
} from "../mycelium/CorrectionLookup";
import {
  compareTombstoneSummaries,
  type CorrectionTombstoneSummary,
  summarizeTombstonePacketsForPhrase,
} from "../mycelium/TombstoneLookup";
import { compareRankedCorrections } from "../mycelium/CorrectionConflict";
import { buildTombstoneExecutionPreview } from "../mycelium/TombstoneExecutionPreview";
import { createCorrectionGovernanceRateLimiter } from "../server/routes/correctionRateLimiter";
import { test, runTests } from "./testHarness";
import { calculateMeaningScore } from "../mycelium/LanguageConfidence";
import { SQLiteStore } from "../storage/sqliteStore";

const TEST_ZONE = "unit_test_zone";
const TEST_AUTHOR = "unit_test_author";

function unitDbPath(name: string): string {
  return join(
    process.cwd(),
    "data",
    `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );
}

function correctionPacketsWithVotes(args: {
  phraseId: string;
  correctionId: string;
  originalMeaningId?: string;
  confirmVotes?: number;
  rejectVotes?: number;
  proposedAt?: number;
}): LmpPacket[] {
  const originalMeaningId =
    args.originalMeaningId ?? `${args.correctionId}_original_meaning`;
  const proposal = createPacket({
    packet_type: "meaning_correction_proposed",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload: {
      phrase_id: args.phraseId,
      original_meaning_id: originalMeaningId,
      correction_id: args.correctionId,
      corrected_reference_meaning: "Corrected meaning.",
    },
  });

  if (args.proposedAt !== undefined) {
    proposal.created_at = args.proposedAt;
  }

  const packets: LmpPacket[] = [proposal];

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

function previewCorrection(
  correctionId: string,
  overrides: Partial<CorrectionSummary> = {}
): CorrectionSummary {
  return {
    phrase_id: "unit_phrase_tombstone_execution_preview",
    original_meaning_id: `${correctionId}_original`,
    correction_id: correctionId,
    corrected_reference_meaning: `${correctionId} corrected meaning`,
    confirm_votes: 1,
    reject_votes: 0,
    correction_score: 1,
    status: "maturing",
    conflict_group_id: `group_${correctionId}`,
    conflict_rank: 1,
    is_conflicting: false,
    ...overrides,
  };
}

function previewTombstone(
  correctionId: string,
  tombstoneId: string,
  overrides: Partial<CorrectionTombstoneSummary> = {}
): CorrectionTombstoneSummary {
  return {
    phrase_id: "unit_phrase_tombstone_execution_preview",
    correction_id: correctionId,
    tombstone_id: tombstoneId,
    reason: "negative_score",
    proposal_packet_id: `${tombstoneId}_proposal_packet`,
    proposed_at: 1_000,
    confirm_votes: 0,
    reject_votes: 0,
    tombstone_score: 0,
    status: "pending",
    ...overrides,
  };
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

test("local node identity is created once", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_identity_created_once"));
  const identity = store.getOrCreateLocalNodeIdentity();
  const repeatedIdentity = store.getOrCreateLocalNodeIdentity();

  assert.match(identity.node_id, /^mycelium_node_[0-9a-f]{16}$/);
  assert.strictEqual(identity.display_name, "Local Mycelium Node");
  assert.strictEqual(identity.default_author, identity.node_id);
  assert.deepStrictEqual(repeatedIdentity, identity);
});

test("local node identity persists after restart", () => {
  const dbPath = unitDbPath("unit_local_identity_restart");
  const firstStore = new SQLiteStore(dbPath);
  const firstIdentity = firstStore.getOrCreateLocalNodeIdentity();
  const restartedStore = new SQLiteStore(dbPath);
  const restartedIdentity = restartedStore.getOrCreateLocalNodeIdentity();

  assert.strictEqual(restartedIdentity.node_id, firstIdentity.node_id);
  assert.strictEqual(restartedIdentity.display_name, firstIdentity.display_name);
  assert.strictEqual(
    restartedIdentity.default_author,
    firstIdentity.default_author
  );
  assert.strictEqual(restartedIdentity.created_at, firstIdentity.created_at);
});

test("local node identity display name can be updated", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_identity_display_name"));
  const identity = store.getOrCreateLocalNodeIdentity();
  const updatedIdentity = store.updateLocalNodeIdentity({
    display_name: "Kitchen Mycelium Node",
  });

  assert.strictEqual(updatedIdentity.node_id, identity.node_id);
  assert.strictEqual(updatedIdentity.display_name, "Kitchen Mycelium Node");
  assert.strictEqual(updatedIdentity.default_author, identity.default_author);
});

test("local node identity default author can be updated", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_identity_author"));
  const identity = store.getOrCreateLocalNodeIdentity();
  const updatedIdentity = store.updateLocalNodeIdentity({
    default_author: "local_author_main",
  });

  assert.strictEqual(updatedIdentity.node_id, identity.node_id);
  assert.strictEqual(updatedIdentity.display_name, identity.display_name);
  assert.strictEqual(updatedIdentity.default_author, "local_author_main");
});

test("local node identity update keeps node id immutable", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_identity_immutable"));
  const identity = store.getOrCreateLocalNodeIdentity();
  const updatedIdentity = store.updateLocalNodeIdentity({
    display_name: "Edited Mycelium Node",
    default_author: "edited_local_author",
  });

  assert.strictEqual(updatedIdentity.node_id, identity.node_id);
  assert.strictEqual(
    store.getOrCreateLocalNodeIdentity().node_id,
    identity.node_id
  );
});

test("local node identity rejects empty editable fields", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_identity_empty"));

  assert.throws(
    () => store.updateLocalNodeIdentity({ display_name: "   " }),
    /display_name must be a non-empty string/
  );
  assert.throws(
    () => store.updateLocalNodeIdentity({ default_author: "   " }),
    /default_author must be a non-empty string/
  );
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
      "sort_alpha",
      "sort_beta",
      "sort_early",
    ]
  );
});

test("correction ranking ignores fake proposal timestamps in tied governance", () => {
  const phraseId = "unit_phrase_correction_timestamp_tie";
  const originalMeaningId = "unit_meaning_correction_timestamp_tie";
  const packets = [
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "z_older_fake_timestamp",
      proposedAt: 1,
    }),
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "a_newer_fake_timestamp",
      proposedAt: 9_999,
    }),
  ];

  const firstRun = summarizeCorrectionPacketsForPhrase(phraseId, packets);
  const secondRun = summarizeCorrectionPacketsForPhrase(phraseId, packets);

  assert.strictEqual(firstRun[0].correction_id, "a_newer_fake_timestamp");
  assert.deepStrictEqual(
    secondRun.map((correction) => correction.correction_id),
    firstRun.map((correction) => correction.correction_id)
  );
});

test("correction ranking still prefers higher confirms when scores tie", () => {
  const phraseId = "unit_phrase_correction_higher_confirms";
  const originalMeaningId = "unit_meaning_correction_higher_confirms";
  const packets = [
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "one_confirm_zero_reject",
      confirmVotes: 1,
    }),
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "two_confirms_one_reject",
      confirmVotes: 2,
      rejectVotes: 1,
    }),
  ];

  const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);

  assert.strictEqual(corrections[0].correction_id, "two_confirms_one_reject");
});

test("correction ranking still applies lower-reject tie-break", () => {
  const lowerRejects = {
    correction_id: "lower_rejects",
    confirm_votes: 2,
    reject_votes: 1,
    correction_score: 1,
    conflict_group_id: "group",
    conflict_rank: 1,
    is_conflicting: true,
  };
  const higherRejects = {
    ...lowerRejects,
    correction_id: "higher_rejects",
    reject_votes: 2,
  };

  assert(compareRankedCorrections(lowerRejects, higherRejects) < 0);
});

test("tombstone sorting ignores fake proposal timestamps in tied governance", () => {
  const phraseId = "unit_phrase_tombstone_timestamp_tie";
  const correctionId = "unit_correction_tombstone_timestamp_tie";
  const packets = [
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "z_older_fake_timestamp",
      proposedAt: 1,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "a_newer_fake_timestamp",
      proposedAt: 9_999,
    }),
  ];

  const summaries = summarizeTombstonePacketsForPhrase(phraseId, packets);

  assert.strictEqual(summaries[0].tombstone_id, "a_newer_fake_timestamp");
});

test("tombstone sorting still applies score and vote-count tie-breaks", () => {
  const phraseId = "unit_phrase_tombstone_score_tie_breaks";
  const correctionId = "unit_correction_tombstone_score_tie_breaks";
  const packets = [
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "score_one_one_confirm",
      confirmVotes: 1,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "score_one_more_confirms",
      confirmVotes: 2,
      rejectVotes: 1,
    }),
    ...tombstonePacketsWithVotes({
      phraseId,
      correctionId,
      tombstoneId: "score_three",
      confirmVotes: 3,
    }),
  ];

  const summaries = summarizeTombstonePacketsForPhrase(phraseId, packets);

  assert.deepStrictEqual(
    summaries.map((summary) => summary.tombstone_id),
    ["score_three", "score_one_more_confirms", "score_one_one_confirm"]
  );
});

test("tombstone sorting still applies lower-reject tie-break", () => {
  const lowerRejects = {
    phrase_id: "phrase",
    correction_id: "correction",
    tombstone_id: "lower_rejects",
    reason: "negative_score" as const,
    proposal_packet_id: "packet_a",
    proposed_at: 2,
    confirm_votes: 2,
    reject_votes: 1,
    tombstone_score: 1,
    status: "maturing" as const,
  };
  const higherRejects = {
    ...lowerRejects,
    tombstone_id: "higher_rejects",
    proposal_packet_id: "packet_b",
    reject_votes: 2,
  };

  assert(compareTombstoneSummaries(lowerRejects, higherRejects) < 0);
});

test("tombstone execution preview leaves corrections active without tombstones", () => {
  const phraseId = "unit_phrase_tombstone_execution_preview";
  const preview = buildTombstoneExecutionPreview(
    phraseId,
    [previewCorrection("active_without_tombstone")],
    []
  );

  assert.strictEqual(preview.execution_enabled, false);
  assert.strictEqual(preview.suppressed_count, 0);
  assert.strictEqual(preview.active_count, 1);
  assert.deepStrictEqual(preview.suppressed_corrections, []);
  assert.strictEqual(
    preview.active_corrections[0].correction_id,
    "active_without_tombstone"
  );
});

test("tombstone execution preview only suppresses confirmed tombstones", () => {
  const phraseId = "unit_phrase_tombstone_execution_preview";
  const corrections = [
    previewCorrection("pending_tombstone"),
    previewCorrection("maturing_tombstone"),
    previewCorrection("confirmed_tombstone"),
    previewCorrection("rejected_tombstone"),
    previewCorrection("contested_tombstone"),
  ];
  const tombstones = [
    previewTombstone("pending_tombstone", "pending", {
      status: "pending",
      tombstone_score: 0,
    }),
    previewTombstone("maturing_tombstone", "maturing", {
      status: "maturing",
      confirm_votes: 1,
      tombstone_score: 1,
    }),
    previewTombstone("confirmed_tombstone", "confirmed", {
      status: "confirmed",
      confirm_votes: 3,
      tombstone_score: 3,
    }),
    previewTombstone("rejected_tombstone", "rejected", {
      status: "rejected",
      reject_votes: 3,
      tombstone_score: -3,
    }),
    previewTombstone("contested_tombstone", "contested", {
      status: "contested",
      confirm_votes: 1,
      reject_votes: 1,
      tombstone_score: 0,
    }),
  ];

  const preview = buildTombstoneExecutionPreview(
    phraseId,
    corrections,
    tombstones
  );

  assert.strictEqual(preview.execution_enabled, false);
  assert.strictEqual(preview.suppressed_count, 1);
  assert.strictEqual(preview.active_count, 4);
  assert.strictEqual(
    preview.suppressed_corrections[0].correction_id,
    "confirmed_tombstone"
  );
  assert.strictEqual(
    preview.suppressed_corrections[0].tombstone_status,
    "confirmed"
  );
  assert.deepStrictEqual(
    preview.active_corrections.map((correction) => correction.correction_id),
    [
      "pending_tombstone",
      "maturing_tombstone",
      "rejected_tombstone",
      "contested_tombstone",
    ]
  );
});

test("tombstone execution preview suppresses correction with any confirmed tombstone", () => {
  const phraseId = "unit_phrase_tombstone_execution_preview";
  const preview = buildTombstoneExecutionPreview(
    phraseId,
    [previewCorrection("multiple_tombstones")],
    [
      previewTombstone("multiple_tombstones", "rejected_first", {
        status: "rejected",
        reject_votes: 3,
        tombstone_score: -3,
      }),
      previewTombstone("multiple_tombstones", "confirmed_second", {
        status: "confirmed",
        confirm_votes: 3,
        tombstone_score: 3,
      }),
    ]
  );

  assert.strictEqual(preview.execution_enabled, false);
  assert.strictEqual(preview.suppressed_count, 1);
  assert.strictEqual(preview.active_count, 0);
  assert.strictEqual(
    preview.suppressed_corrections[0].tombstone_id,
    "confirmed_second"
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

