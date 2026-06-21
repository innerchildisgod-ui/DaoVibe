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
    assertSimulation(
      nodeIdentity.identity.default_author === AUTHOR,
      `Expected identity default_author ${AUTHOR}, got ${nodeIdentity.identity.default_author}`
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

    const trace = await client.getPhrasePacketTrace(phraseId);

    assertSimulation(
      trace.trace.packet_count >= 2,
      `Expected packet trace to include at least 2 packets, got ${trace.trace.packet_count}`
    );
    assertSimulation(
      trace.trace.packet_types.phrase_observed === 1,
      `Expected packet trace phrase_observed count 1, got ${trace.trace.packet_types.phrase_observed}`
    );
    assertSimulation(
      trace.trace.packet_types.meaning_proposal === 1,
      `Expected packet trace meaning_proposal count 1, got ${trace.trace.packet_types.meaning_proposal}`
    );

    console.log("app API node status passed");
    console.log("app API diagnostics and sync status passed");
    console.log("app API observe/search/detail flow passed");
    console.log("app API propose/best-meaning/explanation flow passed");
    console.log("app API packet trace flow passed");
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