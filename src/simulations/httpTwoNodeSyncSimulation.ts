import { ChildProcessByStdio, spawn } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import * as http from "http";
import path from "path";
import { Readable } from "stream";
import { createPacket, LmpPacket } from "../protocol/packet";
import { PhraseObservedPayload } from "../protocol/packetTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const NODE_A_DB = path.join(DATA_DIR, "http_two_node_sync_node_a.db");
const NODE_B_DB = path.join(DATA_DIR, "http_two_node_sync_node_b.db");

const ZONE = "http_two_node_sync_simulation_zone";
const NODE_A_AUTHOR = "dev_public_key_http_two_node_a";
const NODE_B_AUTHOR = "dev_public_key_http_two_node_b";
const NODE_A_ID = "node_http_two_node_a";
const NODE_B_ID = "node_http_two_node_b";
const NODE_A_PORT = 3100;
const NODE_B_PORT = 3101;
const NODE_A_BASE_URL = `http://localhost:${NODE_A_PORT}`;
const NODE_B_BASE_URL = `http://localhost:${NODE_B_PORT}`;

interface ManagedServer {
  name: string;
  process: ChildProcessByStdio<null, Readable, Readable>;
  stdout: string[];
  stderr: string[];
}

interface RootResponse {
  ok: boolean;
}

interface AppStatusResponse {
  ok: boolean;
  app: {
    mode: {
      local_first: boolean;
    };
  };
  local_state: {
    packet_count: number;
    knowledge_count: number;
    known_node_count: number;
  };
  sync: {
    change_only_packets: boolean;
  };
}

interface AppObservePhraseResponse {
  ok: boolean;
  result: {
    phrase_id: string;
    packet_id: string;
    packet_type: string;
    created_at: number;
    local_apply_status: string;
    packet_size_class: string;
    route_decision: string;
  };
  error?: string;
}

interface SyncRunResponse {
  ok: boolean;
  result: {
    accepted_new_count: number;
    failed_count: number;
    packet_count: number;
  };
  error?: string;
}

interface SyncPullResponse {
  ok: boolean;
  cursor_before: string;
  cursor_after: string;
  packet_count: number;
  packets: LmpPacket[];
  error?: string;
}

interface CursorResponse {
  ok: boolean;
  cursor: {
    cursor: string;
  };
  error?: string;
}

interface KnowledgeResponse {
  ok: boolean;
  knowledge: Array<{
    phrase_id: string;
  }>;
}

interface LookupPhraseResponse {
  ok: boolean;
  query: string;
  match_count: number;
  matches: Array<{
    phrase_id: string;
  }>;
}

interface PacketSummary {
  packet_id: string;
  phrase_id?: string;
}

interface PacketSummariesResponse {
  ok: boolean;
  packets: PacketSummary[];
}

interface MissingPacketIdsResponse {
  ok: boolean;
  input_count: number;
  known_count: number;
  missing_count: number;
  missing_packet_ids: string[];
}

interface PacketsByIdsResponse {
  ok: boolean;
  packets: LmpPacket[];
}

interface ReceivePacketResponse {
  ok: boolean;
  result: {
    applyStatus?: string;
    apply_status?: string;
  };
  error?: string;
}

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

function formatServerLogs(server: ManagedServer): string {
  return [
    `${server.name} stdout:`,
    server.stdout.join("").trim() || "(empty)",
    `${server.name} stderr:`,
    server.stderr.join("").trim() || "(empty)",
  ].join("\n");
}

function requestJson<T>(
  method: "GET" | "POST",
  urlString: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const request = http.request(
      {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload).toString(),
              }
            : {}),
        },
      },
      (response) => {
        let data = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};

            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              const message =
                typeof parsed.error === "string"
                  ? parsed.error
                  : `HTTP ${response.statusCode}`;

              reject(new Error(message));
              return;
            }

            resolve(parsed as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

async function requestFails(
  method: "GET" | "POST",
  urlString: string,
  body?: unknown
): Promise<boolean> {
  try {
    const response = await requestJson<{ ok?: boolean }>(
      method,
      urlString,
      body
    );

    return response.ok === false;
  } catch {
    return true;
  }
}

function startServer(params: {
  name: string;
  port: number;
  author: string;
  nodeId: string;
  dbPath: string;
}): ManagedServer {
  const childProcess = spawn(
    process.execPath,
    ["-r", "ts-node/register", path.join("src", "server.ts")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CALLSAB_PORT: String(params.port),
        CALLSAB_AUTHOR: params.author,
        CALLSAB_NODE_ID: params.nodeId,
        CALLSAB_DB_PATH: params.dbPath,
        CALLSAB_ZONE: ZONE,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  const server: ManagedServer = {
    name: params.name,
    process: childProcess,
    stdout: [],
    stderr: [],
  };

  childProcess.stdout.setEncoding("utf8");
  childProcess.stderr.setEncoding("utf8");
  childProcess.stdout.on("data", (chunk) => {
    server.stdout.push(String(chunk));
  });
  childProcess.stderr.on("data", (chunk) => {
    server.stderr.push(String(chunk));
  });

  return server;
}

async function waitForServer(
  server: ManagedServer,
  baseUrl: string
): Promise<void> {
  const deadline = Date.now() + 15000;
  let lastError = "";

  while (Date.now() < deadline) {
    if (server.process.exitCode !== null) {
      throw new Error(
        `${server.name} exited before it was ready.\n${formatServerLogs(server)}`
      );
    }

    try {
      const response = await requestJson<RootResponse>("GET", `${baseUrl}/`);

      if (response.ok) {
        return;
      }

      lastError = `${server.name} returned ok=false`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(
    `${server.name} did not respond at ${baseUrl}. Last error: ${lastError}\n${formatServerLogs(server)}`
  );
}

async function assertAppStatus(baseUrl: string): Promise<void> {
  const response = await requestJson<AppStatusResponse>(
    "GET",
    `${baseUrl}/app/status`
  );

  assertSimulation(response.ok, `${baseUrl} app status returned ok=false`);
  assertSimulation(
    response.app.mode.local_first === true,
    `${baseUrl} app status local_first was not true`
  );
  assertSimulation(
    response.sync.change_only_packets === true,
    `${baseUrl} app status change_only_packets was not true`
  );
  assertSimulation(
    typeof response.local_state.packet_count === "number",
    `${baseUrl} app status packet_count was not a number`
  );
  assertSimulation(
    typeof response.local_state.knowledge_count === "number",
    `${baseUrl} app status knowledge_count was not a number`
  );
  assertSimulation(
    typeof response.local_state.known_node_count === "number",
    `${baseUrl} app status known_node_count was not a number`
  );
}

async function stopServer(server: ManagedServer | undefined): Promise<void> {
  if (!server || server.process.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (server.process.exitCode === null) {
        server.process.kill("SIGKILL");
      }

      resolve();
    }, 3000);

    server.process.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    server.process.kill();
  });
}

async function getNodeBCursor(): Promise<string> {
  const response = await requestJson<CursorResponse>(
    "GET",
    `${NODE_B_BASE_URL}/sync/cursor/${encodeURIComponent(NODE_A_AUTHOR)}`
  );

  assertSimulation(response.ok, response.error ?? "Node B cursor request failed");

  return response.cursor.cursor;
}

async function assertNodeBDoesNotHavePacket(packetId: string): Promise<void> {
  const response = await requestJson<PacketsByIdsResponse>(
    "POST",
    `${NODE_B_BASE_URL}/packetsByIds`,
    {
      packet_ids: [packetId],
    }
  );

  assertSimulation(response.ok, "Node B packetsByIds returned ok=false");
  assertSimulation(
    response.packets.length === 0,
    `Expected node B not to store packet ${packetId}`
  );
}

async function assertNodeBDoesNotHavePhrase(phraseId: string): Promise<void> {
  const response = await requestJson<KnowledgeResponse>(
    "GET",
    `${NODE_B_BASE_URL}/listKnowledge`
  );

  assertSimulation(response.ok, "Node B listKnowledge returned ok=false");
  assertSimulation(
    !response.knowledge.some((phrase) => phrase.phrase_id === phraseId),
    `Expected node B knowledge not to contain phrase ${phraseId}`
  );
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(NODE_A_DB);
  clearSqliteDatabase(NODE_B_DB);

  let nodeA: ManagedServer | undefined;
  let nodeB: ManagedServer | undefined;

  try {
    nodeA = startServer({
      name: "Node A",
      port: NODE_A_PORT,
      author: NODE_A_AUTHOR,
      nodeId: NODE_A_ID,
      dbPath: NODE_A_DB,
    });
    nodeB = startServer({
      name: "Node B",
      port: NODE_B_PORT,
      author: NODE_B_AUTHOR,
      nodeId: NODE_B_ID,
      dbPath: NODE_B_DB,
    });

    await Promise.all([
      waitForServer(nodeA, NODE_A_BASE_URL),
      waitForServer(nodeB, NODE_B_BASE_URL),
    ]);

    await Promise.all([
      assertAppStatus(NODE_A_BASE_URL),
      assertAppStatus(NODE_B_BASE_URL),
    ]);

    console.log("HTTP app status endpoint passed");

    const phrasePayload = {
      phrase_id: "http_two_node_sync_phrase_001",
      surface_text: "http sync ah?",
      phonetic_hint: "http-sync-aa",
      language_hint: "Tamil-English slang",
      input_type: "speech",
    };

    await requestJson("POST", `${NODE_A_BASE_URL}/observePhrase`, phrasePayload);

    const firstSync = await requestJson<SyncRunResponse>(
      "POST",
      `${NODE_B_BASE_URL}/sync/run`,
      {
        remote_base_url: NODE_A_BASE_URL,
        peer_author: NODE_A_AUTHOR,
        limit: 100,
      }
    );

    assertSimulation(firstSync.ok, firstSync.error ?? "First HTTP sync failed");
    assertSimulation(
      firstSync.result.accepted_new_count === 1,
      `Expected accepted_new_count 1, got ${firstSync.result.accepted_new_count}`
    );
    assertSimulation(
      firstSync.result.failed_count === 0,
      `Expected failed_count 0, got ${firstSync.result.failed_count}`
    );

    const knowledge = await requestJson<KnowledgeResponse>(
      "GET",
      `${NODE_B_BASE_URL}/listKnowledge`
    );

    assertSimulation(knowledge.ok, "Node B listKnowledge returned ok=false");
    assertSimulation(
      knowledge.knowledge.some(
        (phrase) => phrase.phrase_id === phrasePayload.phrase_id
      ),
      `Node B knowledge is missing phrase ${phrasePayload.phrase_id}`
    );

    const phraseLookup = await requestJson<LookupPhraseResponse>(
      "POST",
      `${NODE_B_BASE_URL}/app/lookupPhrase`,
      {
        query: phrasePayload.surface_text,
      }
    );

    assertSimulation(phraseLookup.ok, "Node B phrase lookup returned ok=false");
    assertSimulation(
      phraseLookup.match_count >= 1,
      `Expected phrase lookup to return at least 1 match, got ${phraseLookup.match_count}`
    );
    assertSimulation(
      phraseLookup.matches.some(
        (match) => match.phrase_id === phrasePayload.phrase_id
      ),
      `Expected phrase lookup to include phrase ${phrasePayload.phrase_id}`
    );

    const emptyLookupFailed = await requestFails(
      "POST",
      `${NODE_B_BASE_URL}/app/lookupPhrase`,
      {
        query: "   ",
      }
    );

    assertSimulation(emptyLookupFailed, "Expected empty phrase lookup to fail");

    console.log("HTTP app phrase lookup endpoint passed");

    await delay(1100);

    const appPhrasePayload: PhraseObservedPayload = {
      phrase_id: "http_app_observe_phrase_001",
      surface_text: "saptiya?",
      phonetic_hint: "saaptiyaa",
      language_hint: "Tamil-English slang",
      input_type: "text",
    };
    const appObserve = await requestJson<AppObservePhraseResponse>(
      "POST",
      `${NODE_A_BASE_URL}/app/observePhrase`,
      appPhrasePayload
    );

    assertSimulation(appObserve.ok, appObserve.error ?? "App observe failed");
    assertSimulation(
      appObserve.result.phrase_id === appPhrasePayload.phrase_id,
      `Expected app observe phrase_id ${appPhrasePayload.phrase_id}, got ${appObserve.result.phrase_id}`
    );
    assertSimulation(
      appObserve.result.packet_type === "phrase_observed",
      `Expected app observe packet_type phrase_observed, got ${appObserve.result.packet_type}`
    );
    assertSimulation(
      typeof appObserve.result.packet_id === "string",
      "Expected app observe packet_id to be a string"
    );
    assertSimulation(
      appObserve.result.local_apply_status === "applied_to_knowledge",
      `Expected app observe local_apply_status applied_to_knowledge, got ${appObserve.result.local_apply_status}`
    );

    const nodeAAppLookup = await requestJson<LookupPhraseResponse>(
      "POST",
      `${NODE_A_BASE_URL}/app/lookupPhrase`,
      {
        query: appPhrasePayload.surface_text,
      }
    );

    assertSimulation(
      nodeAAppLookup.matches.some(
        (match) => match.phrase_id === appPhrasePayload.phrase_id
      ),
      `Expected Node A app lookup to include phrase ${appPhrasePayload.phrase_id}`
    );

    const appPhraseSync = await requestJson<SyncRunResponse>(
      "POST",
      `${NODE_B_BASE_URL}/sync/run`,
      {
        remote_base_url: NODE_A_BASE_URL,
        peer_author: NODE_A_AUTHOR,
        limit: 100,
      }
    );

    assertSimulation(
      appPhraseSync.result.accepted_new_count === 1,
      `Expected app phrase sync accepted_new_count 1, got ${appPhraseSync.result.accepted_new_count}`
    );
    assertSimulation(
      appPhraseSync.result.failed_count === 0,
      `Expected app phrase sync failed_count 0, got ${appPhraseSync.result.failed_count}`
    );

    const nodeBAppLookup = await requestJson<LookupPhraseResponse>(
      "POST",
      `${NODE_B_BASE_URL}/app/lookupPhrase`,
      {
        query: appPhrasePayload.surface_text,
      }
    );

    assertSimulation(
      nodeBAppLookup.matches.some(
        (match) => match.phrase_id === appPhrasePayload.phrase_id
      ),
      `Expected Node B app lookup to include phrase ${appPhrasePayload.phrase_id}`
    );

    const missingPhraseIdFailed = await requestFails(
      "POST",
      `${NODE_A_BASE_URL}/app/observePhrase`,
      {
        surface_text: "missing id",
        input_type: "text",
      }
    );
    const missingTextFailed = await requestFails(
      "POST",
      `${NODE_A_BASE_URL}/app/observePhrase`,
      {
        phrase_id: "http_app_observe_missing_text_001",
        input_type: "text",
      }
    );

    assertSimulation(
      missingPhraseIdFailed,
      "Expected app observe without phrase_id to fail"
    );
    assertSimulation(
      missingTextFailed,
      "Expected app observe without text fields to fail"
    );

    console.log("HTTP app phrase observation endpoint passed");
    console.log("HTTP success sync passed");

    const secondSync = await requestJson<SyncRunResponse>(
      "POST",
      `${NODE_B_BASE_URL}/sync/run`,
      {
        remote_base_url: NODE_A_BASE_URL,
        peer_author: NODE_A_AUTHOR,
        limit: 100,
      }
    );

    assertSimulation(
      secondSync.result.packet_count === 0,
      `Expected second sync packet_count 0, got ${secondSync.result.packet_count}`
    );

    console.log("HTTP duplicate/cursor check passed");

    const corruptCursorBefore = await getNodeBCursor();

    await delay(1100);

    const corruptPhrasePayload: PhraseObservedPayload = {
      phrase_id: "http_two_node_sync_corrupt_phrase_001",
      surface_text: "http corrupt sync ah?",
      phonetic_hint: "http-corrupt-sync-aa",
      language_hint: "Tamil-English slang",
      input_type: "speech",
    };

    await requestJson(
      "POST",
      `${NODE_A_BASE_URL}/observePhrase`,
      corruptPhrasePayload
    );

    const corruptBatch = await requestJson<SyncPullResponse>(
      "GET",
      `${NODE_A_BASE_URL}/sync/pull?cursor=${encodeURIComponent(
        corruptCursorBefore
      )}&limit=100`
    );

    assertSimulation(corruptBatch.ok, corruptBatch.error ?? "Sync pull failed");
    assertSimulation(
      corruptBatch.packet_count === 1,
      `Expected corrupt test pull to return 1 packet, got ${corruptBatch.packet_count}`
    );

    const originalPacket = corruptBatch.packets[0];
    const corruptedPacket = {
      ...originalPacket,
      payload: {
        ...(originalPacket.payload as PhraseObservedPayload),
        surface_text: "tampered without rehashing",
      },
    };

    const corruptedImportFailed = await requestFails(
      "POST",
      `${NODE_B_BASE_URL}/sync/importBatch`,
      {
        peer_author: NODE_A_AUTHOR,
        cursor_before: corruptCursorBefore,
        cursor_after: corruptBatch.cursor_after,
        packets: [corruptedPacket],
      }
    );

    assertSimulation(
      corruptedImportFailed,
      "Expected corrupted packet import to fail"
    );
    assertSimulation(
      (await getNodeBCursor()) === corruptCursorBefore,
      "Expected corrupted packet import to leave node B cursor unchanged"
    );

    await assertNodeBDoesNotHavePacket(corruptedPacket.packet_id);
    await assertNodeBDoesNotHavePhrase(corruptPhrasePayload.phrase_id);

    const cleanupReceive = await requestJson<ReceivePacketResponse>(
      "POST",
      `${NODE_B_BASE_URL}/receivePacket`,
      originalPacket
    );

    assertSimulation(
      cleanupReceive.ok,
      cleanupReceive.error ?? "Expected original packet cleanup receive to pass"
    );
    assertSimulation(
      cleanupReceive.result.applyStatus === "applied_to_knowledge" ||
        cleanupReceive.result.apply_status === "applied_to_knowledge",
      "Expected original packet cleanup receive to apply to knowledge"
    );

    console.log("HTTP corrupted packet rejection passed");

    const expiredCursorBefore = await getNodeBCursor();
    const expiredPhrasePayload: PhraseObservedPayload = {
      phrase_id: "http_two_node_sync_expired_phrase_001",
      surface_text: "http expired sync ah?",
      phonetic_hint: "http-expired-sync-aa",
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
    const expiredImportFailed = await requestFails(
      "POST",
      `${NODE_B_BASE_URL}/sync/importBatch`,
      {
        peer_author: NODE_A_AUTHOR,
        cursor_before: expiredCursorBefore,
        cursor_after: `${expiredPacket.created_at}:${expiredPacket.packet_id}`,
        packets: [expiredPacket],
      }
    );

    assertSimulation(
      expiredImportFailed,
      "Expected expired packet import to fail"
    );
    assertSimulation(
      (await getNodeBCursor()) === expiredCursorBefore,
      "Expected expired packet import to leave node B cursor unchanged"
    );

    await assertNodeBDoesNotHavePacket(expiredPacket.packet_id);
    await assertNodeBDoesNotHavePhrase(expiredPhrasePayload.phrase_id);

    console.log("HTTP expired packet rejection passed");

    const inventoryPhrasePayload: PhraseObservedPayload = {
      phrase_id: "http_two_node_sync_inventory_phrase_001",
      surface_text: "inventory sync ah?",
      phonetic_hint: "inventory-sync-aa",
      language_hint: "Tamil-English slang",
      input_type: "speech",
    };

    await requestJson(
      "POST",
      `${NODE_A_BASE_URL}/observePhrase`,
      inventoryPhrasePayload
    );

    const nodeASummaries = await requestJson<PacketSummariesResponse>(
      "GET",
      `${NODE_A_BASE_URL}/packetSummaries?limit=100`
    );

    assertSimulation(nodeASummaries.ok, "Node A packetSummaries returned ok=false");

    const inventoryPacketSummary = nodeASummaries.packets.find(
      (packet) => packet.phrase_id === inventoryPhrasePayload.phrase_id
    );
    const nodeAPacketIds = nodeASummaries.packets.map(
      (packet) => packet.packet_id
    );

    assertSimulation(
      inventoryPacketSummary !== undefined,
      `Expected Node A packet summaries to include phrase ${inventoryPhrasePayload.phrase_id}`
    );
    const inventoryPacketId = inventoryPacketSummary?.packet_id;

    assertSimulation(
      typeof inventoryPacketId === "string",
      `Expected inventory packet ID for phrase ${inventoryPhrasePayload.phrase_id}`
    );

    const missingInventory = await requestJson<MissingPacketIdsResponse>(
      "POST",
      `${NODE_B_BASE_URL}/sync/missingPacketIds`,
      {
        packet_ids: nodeAPacketIds,
      }
    );

    assertSimulation(
      missingInventory.ok,
      "Node B missingPacketIds returned ok=false"
    );
    assertSimulation(
      missingInventory.input_count === nodeAPacketIds.length,
      `Expected missingPacketIds input_count ${nodeAPacketIds.length}, got ${missingInventory.input_count}`
    );
    assertSimulation(
      missingInventory.missing_count === 1,
      `Expected exactly 1 missing packet ID, got ${missingInventory.missing_count}`
    );
    assertSimulation(
      missingInventory.missing_packet_ids[0] === inventoryPacketId,
      `Expected missing packet ID ${missingInventory.missing_packet_ids[0]} to match inventory packet ${inventoryPacketId}`
    );

    const missingPackets = await requestJson<PacketsByIdsResponse>(
      "POST",
      `${NODE_A_BASE_URL}/packetsByIds`,
      {
        packet_ids: missingInventory.missing_packet_ids,
      }
    );

    assertSimulation(missingPackets.ok, "Node A packetsByIds returned ok=false");
    assertSimulation(
      missingPackets.packets.length === 1,
      `Expected Node A to return 1 missing packet, got ${missingPackets.packets.length}`
    );

    const inventoryReceive = await requestJson<ReceivePacketResponse>(
      "POST",
      `${NODE_B_BASE_URL}/receivePacket`,
      missingPackets.packets[0]
    );

    assertSimulation(
      inventoryReceive.ok,
      inventoryReceive.error ?? "Inventory receivePacket returned ok=false"
    );
    assertSimulation(
      inventoryReceive.result.applyStatus === "applied_to_knowledge" ||
        inventoryReceive.result.apply_status === "applied_to_knowledge",
      "Expected inventory receivePacket to apply to knowledge"
    );

    const inventoryKnowledge = await requestJson<KnowledgeResponse>(
      "GET",
      `${NODE_B_BASE_URL}/listKnowledge`
    );

    assertSimulation(
      inventoryKnowledge.knowledge.some(
        (phrase) => phrase.phrase_id === inventoryPhrasePayload.phrase_id
      ),
      `Expected Node B knowledge to contain phrase ${inventoryPhrasePayload.phrase_id}`
    );

    const updatedMissingInventory =
      await requestJson<MissingPacketIdsResponse>(
        "POST",
        `${NODE_B_BASE_URL}/sync/missingPacketIds`,
        {
          packet_ids: nodeAPacketIds,
        }
      );

    assertSimulation(
      updatedMissingInventory.missing_count === 0 &&
        updatedMissingInventory.missing_packet_ids.length === 0,
      "Expected inventory comparison to find zero missing packet IDs after receivePacket"
    );

    console.log("HTTP missing-packet inventory endpoint passed");
    console.log("HTTP two-node sync simulation succeeded.");
  } finally {
    await Promise.all([stopServer(nodeA), stopServer(nodeB)]);
  }
}

runSimulation().catch((error) => {
  console.error("HTTP two-node sync simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
