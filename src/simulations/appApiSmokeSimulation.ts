import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { createServer as createHttpServer } from "http";
import type { Server } from "http";
import { LanguageEngine } from "../engine";
import { MyceliumClient } from "../client/MyceliumClient";
import type { ServerConfig } from "../config/env";
import { MyceliumController } from "../mycelium/MyceliumController";
import { createServer } from "../server/createServer";
import { SyncController } from "../sync/SyncController";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app_api_smoke_node.db");

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ZONE = "app_api_smoke_simulation_zone";
const AUTHOR = "dev_public_key_app_api_smoke";
const NODE_ID = "node_app_api_smoke";

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

async function assertRejects(
  action: () => Promise<unknown>,
  message: string
): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }

  throw new Error(message);
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(DB_PATH);

  const config: ServerConfig = {
    port: PORT,
    author: AUTHOR,
    nodeId: NODE_ID,
    nodeAgeGroup: "adult",
    dbPath: DB_PATH,
    defaultDbPath: DB_PATH,
    zone: ZONE,
  };

  const engine = new LanguageEngine({
    zone: config.zone,
    author: config.author,
    nodeAgeGroup: config.nodeAgeGroup,
    dbPath: config.dbPath,
  });
  const app = createServer({
    config,
    engine,
  });
  const server = createHttpServer(app);
  const client = new MyceliumClient({ baseUrl: BASE_URL });

  try {
    await listen(server);

    const nodeStatus = await client.getNodeStatus();
    const nodeIdentity = await client.getNodeIdentity();
    const nodeSettings = await client.getNodeSettings();
    const nodeDiagnostics = await client.getNodeDiagnostics();
    const syncStatus = await client.getSyncStatus();

    assertSimulation(
      nodeStatus.service.status === "ready",
      `Expected ready service status, got ${nodeStatus.service.status}`
    );
    const resolvedNodeId = nodeIdentity.identity.node_id;

    assertSimulation(
      typeof resolvedNodeId === "string" && resolvedNodeId.length > 0,
      "Expected local node identity to expose a generated node_id"
    );
    assertSimulation(
      nodeStatus.node.node_id === resolvedNodeId,
      `Expected status node_id ${resolvedNodeId}, got ${nodeStatus.node.node_id}`
    );
    const resolvedDefaultAuthor = nodeIdentity.identity.default_author;

    assertSimulation(
      typeof resolvedDefaultAuthor === "string" &&
        resolvedDefaultAuthor.length > 0,
      "Expected local node identity to expose a generated default_author"
    );
    assertSimulation(
      nodeStatus.node.default_author === resolvedDefaultAuthor,
      `Expected status default_author ${resolvedDefaultAuthor}, got ${nodeStatus.node.default_author}`
    );
    assertSimulation(
      nodeSettings.settings.sync_mode === "manual",
      `Expected manual sync mode, got ${nodeSettings.settings.sync_mode}`
    );
    assertSimulation(
      nodeDiagnostics.diagnostics.server_reachable === true,
      "Expected diagnostics server_reachable true"
    );
    assertSimulation(
      syncStatus.sync.enabled === true,
      "Expected sync status enabled true"
    );

    const missingPhraseId = "app_api_smoke_missing_phrase";

    await assertRejects(
      () => client.getPhrase(missingPhraseId),
      "Expected unknown phrase detail request to fail"
    );


    const missingKycClaimId = "app_api_smoke_missing_kyc_claim";

    await assertRejects(
      () => client.getKycClaimSummary(missingKycClaimId),
      "Expected unknown KYC claim summary request to fail"
    );

    const kycClaimId = "app_api_smoke_kyc_claim_001";

    const kycClaim = engine.createKycClaim({
      kyc_claim_id: kycClaimId,
      subject_node_id: "app_api_smoke_subject_node_001",
      country_hint: "IN",
      document_type_hint: "government_id",
      consent_text_hash: "app_api_smoke_kyc_consent_hash",
      consented_at: 1_000,
    });

    const kycEvidence = engine.prepareKycEvidence(
      {
        kyc_claim_id: kycClaimId,
        evidence_id: "app_api_smoke_kyc_evidence_001",
        evidence_kinds: ["id_face_crop", "current_selfie", "liveness_video"],
        evidence_bundle_hash: "app_api_smoke_minimized_evidence_bundle_hash",
        full_id_shared: false,
        retention_expires_at: 2_000,
      },
      kycClaim.packet.packet_id
    );

    const kycAiAssessment = engine.completeKycAiAssessment(
      {
        kyc_claim_id: kycClaimId,
        assessment_id: "app_api_smoke_kyc_ai_assessment_001",
        result: "unsure",
        face_match_score: 0.73,
        liveness_score: 0.91,
        spoof_risk_score: 0.08,
        reason: "known-person verification required",
      },
      kycEvidence.packet.packet_id
    );

    const kycInvite = engine.inviteKycKnownVerifier(
      {
        kyc_claim_id: kycClaimId,
        verifier_node_id: "app_api_smoke_known_verifier_001",
        invite_id: "app_api_smoke_kyc_invite_001",
        evidence_bundle_hash: "app_api_smoke_minimized_evidence_bundle_hash",
        expires_at: 2_000,
      },
      kycAiAssessment.packet.packet_id
    );

    const kycVote = engine.voteKycKnownVerifier(
      {
        kyc_claim_id: kycClaimId,
        invite_id: "app_api_smoke_kyc_invite_001",
        verifier_node_id: "app_api_smoke_known_verifier_001",
        vote: "same_person",
        reason: "known verifier confirms identity continuity",
      },
      kycInvite.packet.packet_id
    );

    const kycQuorum = engine.recordKycQuorumResult(
      {
        kyc_claim_id: kycClaimId,
        status: "needs_more_review",
        same_person_votes: 1,
        not_same_person_votes: 0,
        unsure_votes: 0,
        suspicious_votes: 0,
        ai_result: "unsure",
        result_reason: "more known verifiers needed",
      },
      kycVote.packet.packet_id
    );

    engine.expireKycEvidence(
      {
        kyc_claim_id: kycClaimId,
        evidence_id: "app_api_smoke_kyc_evidence_001",
        expired_at: 2_001,
        deletion_proof_hash: "app_api_smoke_kyc_evidence_deletion_hash",
      },
      kycQuorum.packet.packet_id
    );

    const kycSummary = await client.getKycClaimSummary(kycClaimId);

    assertSimulation(
      kycSummary.summary.kyc_claim_id === kycClaimId,
      `Expected KYC summary for ${kycClaimId}, got ${kycSummary.summary.kyc_claim_id}`
    );

    assertSimulation(
      kycSummary.summary.status === "needs_more_review",
      `Expected KYC status needs_more_review, got ${kycSummary.summary.status}`
    );

    assertSimulation(
      kycSummary.summary.full_id_shared === false,
      "Expected KYC summary to preserve full_id_shared=false"
    );

    assertSimulation(
      kycSummary.summary.known_verifier_vote_counts.same_person === 1,
      "Expected KYC summary to include one same_person verifier vote"
    );

    const packetCountBeforeInvalidWrites = (
      await client.getNodeStatus()
    ).ledger.packet_count;

    const invalidObservePhraseId = "app_api_smoke_invalid_observe_phrase";

    await assertRejects(
      () =>
        client.observePhrase({
          phrase_id: invalidObservePhraseId,
          surface_text: " ",
          language_hint: "English",
          input_type: "text",
        }),
      "Expected blank surface_text observe request to fail"
    );

    const packetCountAfterInvalidWrites = (
      await client.getNodeStatus()
    ).ledger.packet_count;

    assertSimulation(
      packetCountAfterInvalidWrites === packetCountBeforeInvalidWrites,
      `Expected invalid writes to leave packet_count at ${packetCountBeforeInvalidWrites}, got ${packetCountAfterInvalidWrites}`
    );

    const phraseId = "app_api_smoke_phrase_001";
    const meaningId = "app_api_smoke_meaning_001";

    const observed = await client.observePhrase({
      phrase_id: phraseId,
      surface_text: "app api smoke phrase",
      language_hint: "English",
      input_type: "text",
    });

    assertSimulation(
      observed.result.phrase_id === phraseId,
      `Expected observed phrase ${phraseId}, got ${observed.result.phrase_id}`
    );
    assertSimulation(
      observed.result.packet_type === "phrase_observed",
      `Expected phrase_observed packet, got ${observed.result.packet_type}`
    );

    const search = await client.searchPhrases("smoke");

    assertSimulation(
      search.results.some((result) => result.phrase_id === phraseId),
      `Expected search results to include ${phraseId}`
    );

    const phrase = await client.getPhrase(phraseId);

    assertSimulation(
      phrase.phrase?.phrase_id === phraseId,
      `Expected phrase detail ${phraseId}, got ${phrase.phrase?.phrase_id}`
    );

    const noMeaningPhraseId = "app_api_smoke_phrase_no_meaning";

    const noMeaningObserved = await client.observePhrase({
      phrase_id: noMeaningPhraseId,
      surface_text: "app api smoke phrase without meaning",
      language_hint: "English",
      input_type: "text",
    });

    assertSimulation(
      noMeaningObserved.result.phrase_id === noMeaningPhraseId,
      `Expected observed no-meaning phrase ${noMeaningPhraseId}, got ${noMeaningObserved.result.phrase_id}`
    );

    const noMeaningBest = await client.getBestMeaning(noMeaningPhraseId);

    assertSimulation(
      noMeaningBest.has_best_meaning === false,
      "Expected no best meaning before any meaning proposal"
    );
    assertSimulation(
      noMeaningBest.best_meaning === undefined ||
        noMeaningBest.best_meaning === null,
      "Expected empty best_meaning before any meaning proposal"
    );

    await assertRejects(
      () =>
        client.proposeMeaning({
          phrase_id: phraseId,
          meaning_id: "app_api_smoke_invalid_meaning",
          reference_meaning: " ",
          context: "app-api-smoke-invalid-write",
          confidence: 0.5,
        }),
      "Expected blank reference_meaning proposal request to fail"
    );

    const proposed = await client.proposeMeaning({
      phrase_id: phraseId,
      meaning_id: meaningId,
      reference_meaning: "A test phrase proving the app API smoke path.",
      context: "app-api-smoke-simulation",
      confidence: 0.7,
    });

    assertSimulation(
      proposed.result.meaning_id === meaningId,
      `Expected proposed meaning ${meaningId}, got ${proposed.result.meaning_id}`
    );
    assertSimulation(
      proposed.result.packet_type === "meaning_proposal",
      `Expected meaning_proposal packet, got ${proposed.result.packet_type}`
    );

    const bestMeaning = await client.getBestMeaning(phraseId);

    assertSimulation(
      bestMeaning.has_best_meaning === true,
      "Expected best meaning to exist after proposal"
    );
    assertSimulation(
      bestMeaning.best_meaning?.meaning_id === meaningId,
      `Expected best meaning ${meaningId}, got ${bestMeaning.best_meaning?.meaning_id}`
    );

    const explanation = await client.getBestMeaningExplanation(phraseId);

    assertSimulation(
      explanation.best_meaning?.meaning_id === meaningId,
      `Expected explanation best meaning ${meaningId}, got ${explanation.best_meaning?.meaning_id}`
    );
    assertSimulation(
      explanation.evidence.meaning_count >= 1,
      `Expected explanation meaning_count >= 1, got ${explanation.evidence.meaning_count}`
    );

    const packetCountBeforeInvalidCorrectionProposal = (
      await client.getNodeStatus()
    ).ledger.packet_count;

    await assertRejects(
      () =>
        client.proposeMeaningCorrection({
          phrase_id: phraseId,
          original_meaning_id: meaningId,
          correction_id: "app_api_smoke_invalid_correction",
          corrected_reference_meaning: " ",
          correction_context: "app-api-smoke-invalid-correction",
          source: "app-api-smoke",
        }),
      "Expected blank corrected_reference_meaning correction proposal to fail"
    );

    const packetCountAfterInvalidCorrectionProposal = (
      await client.getNodeStatus()
    ).ledger.packet_count;

    assertSimulation(
      packetCountAfterInvalidCorrectionProposal ===
        packetCountBeforeInvalidCorrectionProposal,
      `Expected invalid correction proposal to leave packet_count at ${packetCountBeforeInvalidCorrectionProposal}, got ${packetCountAfterInvalidCorrectionProposal}`
    );

    const correctionId = "app_api_smoke_correction_001";

    const correctionProposal = await client.proposeMeaningCorrection({
      phrase_id: phraseId,
      original_meaning_id: meaningId,
      correction_id: correctionId,
      corrected_reference_meaning:
        "A corrected test phrase proving the app API correction path.",
      correction_context: "app-api-smoke-correction",
      source: "app-api-smoke",
    });

    assertSimulation(
      correctionProposal.accepted === true,
      "Expected correction proposal to be accepted"
    );
    assertSimulation(
      correctionProposal.result.correction_id === correctionId,
      `Expected correction proposal ${correctionId}, got ${correctionProposal.result.correction_id}`
    );

    const correctionVote = await client.voteMeaningCorrection({
      phrase_id: phraseId,
      correction_id: correctionId,
      vote: "confirm",
      voter: "app_api_smoke_voter",
    });

    assertSimulation(
      correctionVote.accepted === true,
      "Expected correction vote to be accepted"
    );
    assertSimulation(
      correctionVote.result.correction_id === correctionId,
      `Expected correction vote for ${correctionId}, got ${correctionVote.result.correction_id}`
    );
    assertSimulation(
      correctionVote.result.vote === "confirm",
      `Expected confirm correction vote, got ${correctionVote.result.vote}`
    );

    const corrections = await client.getCorrections(phraseId);
    const votedCorrection = corrections.corrections.find(
      (correction) => correction.correction_id === correctionId
    );

    assertSimulation(
      votedCorrection !== undefined,
      `Expected corrections list to include ${correctionId}`
    );
    assertSimulation(
      (votedCorrection?.confirm_votes ?? 0) >= 1,
      `Expected correction confirm_votes >= 1, got ${votedCorrection?.confirm_votes}`
    );

    const trace = await client.getPhrasePacketTrace(phraseId);

    assertSimulation(
      trace.trace.packet_count >= 4,
      `Expected packet trace to include at least 4 packets, got ${trace.trace.packet_count}`
    );
    assertSimulation(
      trace.trace.packet_types.phrase_observed === 1,
      `Expected packet trace phrase_observed count 1, got ${trace.trace.packet_types.phrase_observed}`
    );
    assertSimulation(
      trace.trace.packet_types.meaning_proposal === 1,
      `Expected packet trace meaning_proposal count 1, got ${trace.trace.packet_types.meaning_proposal}`
    );

    const unreachableClient = new MyceliumClient({
      baseUrl: "http://127.0.0.1:65530",
    });

    await assertRejects(
      () => unreachableClient.getNodeStatus(),
      "Expected unreachable app API client request to fail"
    );

    console.log("app API node status passed");
    console.log("app API diagnostics and sync status passed");
    console.log("app API observe/search/detail flow passed");
    console.log("app API propose/best-meaning/explanation flow passed");
    console.log("app API packet trace flow passed");
    console.log("app API correction vote flow passed");
    console.log("app API KYC summary flow passed");
    console.log("app API invalid correction proposal no-mutation flow passed");
    console.log("app API no-meaning negative flow passed");
    console.log("app API unreachable server negative flow passed");
    console.log("app API unknown phrase negative flow passed");
    console.log("app API invalid observe negative flow passed");
    console.log("app API invalid propose negative flow passed");
    console.log("app API invalid write no-mutation flow passed");
    console.log("App API smoke simulation succeeded.");
  } finally {
    await close(server);
  }
}

runSimulation().catch((error) => {
  console.error("App API smoke simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});