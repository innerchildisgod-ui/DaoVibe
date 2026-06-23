import assert from "assert";
import Database from "better-sqlite3";
import type { Server as HttpServer } from "http";
import { join } from "path";
import { createPacket } from "../protocol/packet";
import type { LmpPacket } from "../protocol/packet";
import {
  clampPhraseSearchLimit,
  selectBestMeaning,
} from "../mycelium/PhraseLookup";
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
import { LanguageEngine } from "../engine";
import { MyceliumController } from "../mycelium/MyceliumController";
import { compareRankedCorrections } from "../mycelium/CorrectionConflict";
import { buildTombstoneExecutionPreview } from "../mycelium/TombstoneExecutionPreview";
import { buildBestMeaningExplanation } from "../mycelium/MeaningExplanation";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_APP_CONTRACT_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "../mycelium/MyceliumVersions";
import { createCorrectionGovernanceRateLimiter } from "../server/routes/correctionRateLimiter";
import { apiError } from "../server/routes/apiResponses";
import { createServer as createMyceliumServer } from "../server/createServer";
import { test, runTests } from "./testHarness";
import {
  calculateMeaningScore,
  countUniqueVoterVotes,
} from "../mycelium/LanguageConfidence";
import { SQLiteStore, type KnowledgePhraseRecord } from "../storage/sqliteStore";
import {
  listAppliedSchemaMigrations,
  runSqliteMigrations,
  SQLITE_MIGRATIONS,
} from "../storage/sqliteMigrations";
import { buildClientUrl } from "../client/clientUrl";
import { MyceliumClient, MyceliumClientError } from "../client/MyceliumClient";
import type { ServerConfig } from "../config/env";
import { createTypeScriptNativeCoreStub } from "../kernel/TypeScriptNativeCoreStub";
import { TypeScriptDoriBoundaryStub } from "../kernel/orchestrators/DoriBoundary";
import { createDefaultMultiDeviceSyncPlan } from "../kernel/sync";

const TEST_ZONE = "unit_test_zone";
const TEST_AUTHOR = "unit_test_author";

function unitDbPath(name: string): string {
  return join(
    process.cwd(),
    "data",
    `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );
}

function unitEngine(name: string): LanguageEngine {
  return new LanguageEngine({
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    nodeAgeGroup: "adult",
    dbPath: unitDbPath(name),
  });
}

function unitServerConfig(name: string): ServerConfig {
  const dbPath = unitDbPath(name);

  return {
    port: 0,
    author: TEST_AUTHOR,
    nodeId: `unit_node_${name}`,
    nodeAgeGroup: "adult",
    dbPath,
    zone: TEST_ZONE,
    defaultDbPath: dbPath,
  };
}

async function withUnitHttpServer(
  engine: LanguageEngine,
  name: string,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createMyceliumServer({
    config: unitServerConfig(name),
    engine,
  });
  const server = app.listen(0);

  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    await closeHttpServer(server);
    throw new Error("Expected unit HTTP server to listen on a TCP port");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeHttpServer(server);
  }
}

function closeHttpServer(server: HttpServer): Promise<void> {
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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

async function withMockFetch(
  mockFetch: typeof fetch,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("client URL builder encodes phrase IDs safely", () => {
  const phraseId = "local/slang phrase?x=1";
  const url = buildClientUrl(
    "http://localhost:3000/",
    `/phrases/${encodeURIComponent(phraseId)}`
  );

  assert.strictEqual(
    url,
    "http://localhost:3000/phrases/local%2Fslang%20phrase%3Fx%3D1"
  );
});

test("client URL builder encodes GET query params", () => {
  const url = buildClientUrl("http://localhost:3000", "/phrases/search", {
    q: "hello world & tea",
    limit: 25,
  });

  assert.strictEqual(
    url,
    "http://localhost:3000/phrases/search?q=hello+world+%26+tea&limit=25"
  );
});

test("client handles baseUrl trailing slash", async () => {
  let capturedUrl = "";
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input);

    return jsonResponse({
      ok: true,
      node: {
        node_id: "node",
        display_name: "Local Mycelium Node",
        default_author: "node",
      },
      service: {
        name: "Mycelium",
        layer: "DAOVibe Mycelium",
        status: "ready",
        uptime_seconds: 1,
        server_time: 1,
      },
      ledger: {
        packet_count: 0,
      },
      storage: {
        durable: true,
        engine: "sqlite",
      },
      settings: {
        sync_mode: "manual",
        developer_mode: true,
        show_debug_panels: true,
      },
      versions: {
        api_version: "mycelium-api.v1",
        protocol_version: "mycelium-lmp.v1",
        app_contract_version: "mycelium-app.v1",
      },
      capabilities: {
        phrase_lookup: true,
        meaning_proposals: true,
        meaning_votes: true,
        corrections: true,
        correction_maturity: true,
        tombstone_packets: true,
        tombstone_execution: false,
        sync: true,
      },
    });
  };

  await withMockFetch(mockFetch, async () => {
    const client = new MyceliumClient({
      baseUrl: "http://localhost:3000///",
    });

    await client.getNodeStatus();
  });

  assert.strictEqual(capturedUrl, "http://localhost:3000/node/status");
});

test("client exposes ledger export and import methods", async () => {
  const calls: Array<{
    url: string;
    method?: string;
    body?: string;
  }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    if (String(input).endsWith("/ledger/export")) {
      return jsonResponse({
        ok: true,
        export_type: "mycelium-ledger-export",
        api_version: MYCELIUM_API_VERSION,
        protocol_version: MYCELIUM_PROTOCOL_VERSION,
        exported_at: 1,
        packet_count: 0,
        packets: [],
      });
    }

    return jsonResponse({
      ok: true,
      import_result: {
        accepted_new_count: 0,
        already_stored_count: 0,
        rejected_invalid_count: 0,
        rejected_expired_count: 0,
        failed_count: 0,
      },
    });
  };

  await withMockFetch(mockFetch, async () => {
    const client = new MyceliumClient({
      baseUrl: "http://localhost:3000",
    });

    await client.exportLedger();
    await client.importLedger({ packets: [{ packet_id: "unit_packet" }] });
  });

  assert.strictEqual(calls[0].url, "http://localhost:3000/ledger/export");
  assert.strictEqual(calls[0].method, "GET");
  assert.strictEqual(calls[1].url, "http://localhost:3000/ledger/import");
  assert.strictEqual(calls[1].method, "POST");
  assert.strictEqual(calls[1].body, '{"packets":[{"packet_id":"unit_packet"}]}');
});

test("apiError returns stable object shape", () => {
  assert.deepStrictEqual(apiError("VALIDATION_ERROR", "query is required"), {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "query is required",
    },
  });

  assert.deepStrictEqual(apiError("NOT_FOUND", "Phrase not found.", {
    phrase_id: "missing_phrase",
  }), {
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Phrase not found.",
      details: {
        phrase_id: "missing_phrase",
      },
    },
  });

  assert.deepStrictEqual(apiError("RATE_LIMITED", "Too many requests."), {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests.",
    },
  });
});

test("TypeScript native core stub reports unimplemented validation", () => {
  const nativeCore = createTypeScriptNativeCoreStub();
  const result = nativeCore.validatePacket({});

  assert.strictEqual(result.ok, false);

  if (result.ok) {
    assert.fail("Expected native core stub validation to be unimplemented.");
  }

  assert.strictEqual(result.error.code, "NATIVE_CORE_NOT_IMPLEMENTED");
});

test("Dori boundary stub describes advisory native-core role", () => {
  const dori = new TypeScriptDoriBoundaryStub();

  assert.match(dori.describeRole(), /Dori/);
});

test("Dori boundary stub stores phrase observations as advisory native-required events", () => {
  const dori = new TypeScriptDoriBoundaryStub();
  const decision = dori.reviewMemoryEvent({
    event_type: "phrase_observation",
    source: "local",
  });

  assert.strictEqual(decision.action, "store");
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.native_required, true);
});

test("Dori boundary stub shows packet traces without native requirement", () => {
  const dori = new TypeScriptDoriBoundaryStub();
  const decision = dori.reviewMemoryEvent({
    event_type: "packet_trace",
    source: "app",
  });

  assert.strictEqual(decision.action, "show");
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.native_required, false);
});

test("Dori boundary stub marks ledger imports for future native review", () => {
  const dori = new TypeScriptDoriBoundaryStub();
  const decision = dori.reviewMemoryEvent({
    event_type: "ledger_import",
    source: "import",
  });

  assert.strictEqual(decision.action, "review");
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.native_required, true);
});

test("Dori boundary stub rejects unknown events for review", () => {
  const dori = new TypeScriptDoriBoundaryStub();
  const decision = dori.reviewMemoryEvent({
    event_type: "unknown",
    source: "unknown",
  });

  assert.strictEqual(decision.action, "review");
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.native_required, true);
});

test("multi-device sync plan defines phone and laptop boundaries", () => {
  const plan = createDefaultMultiDeviceSyncPlan();

  assert.match(plan.principle, /same valid packets/);

  const phoneRole = plan.device_roles.find(
    (role) => role.device_class === "phone"
  );
  const laptopRole = plan.device_roles.find(
    (role) => role.device_class === "laptop"
  );
  const packetSynchronizer = plan.synchronizers.find(
    (synchronizer) => synchronizer.name === "packet"
  );
  const ledgerPortabilitySynchronizer = plan.synchronizers.find(
    (synchronizer) => synchronizer.name === "ledger_portability"
  );

  assert(phoneRole);
  assert.strictEqual(phoneRole.should_avoid_background_heavy_work, true);
  assert(laptopRole);
  assert.strictEqual(laptopRole.can_run_heavy_reconciliation, true);
  assert(packetSynchronizer);
  assert.strictEqual(packetSynchronizer.changes_only, true);
  assert(ledgerPortabilitySynchronizer);
  assert.strictEqual(
    ledgerPortabilitySynchronizer.laptop_preferred_for_heavy_work,
    true
  );
});

test("client HTTP errors extract stable error code and message", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Phrase not found.",
          details: {
            phrase_id: "missing_phrase",
          },
        },
      }),
      {
        status: 404,
        statusText: "Not Found",
      }
    );

  await withMockFetch(mockFetch, async () => {
    const client = new MyceliumClient({
      baseUrl: "http://localhost:3000",
    });

    await assert.rejects(
      () => client.getPhrase("missing_phrase"),
      (error) => {
        assert(error instanceof MyceliumClientError);
        assert.strictEqual(error.status, 404);
        assert.strictEqual(error.code, "NOT_FOUND");
        assert.deepStrictEqual(error.details, {
          phrase_id: "missing_phrase",
        });
        assert.match(error.message, /404 Not Found.*NOT_FOUND.*Phrase not found/);
        return true;
      }
    );
  });
});

test("client HTTP errors include legacy response body text", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('{"ok":false,"error":"bad phrase"}', {
      status: 400,
      statusText: "Bad Request",
    });

  await withMockFetch(mockFetch, async () => {
    const client = new MyceliumClient({
      baseUrl: "http://localhost:3000",
    });

    await assert.rejects(
      () => client.getPhrase("bad phrase"),
      /400 Bad Request.*bad phrase/
    );
  });
});

test("client HTTP errors handle plain text responses", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response("plain backend failure", {
      status: 500,
      statusText: "Internal Server Error",
    });

  await withMockFetch(mockFetch, async () => {
    const client = new MyceliumClient({
      baseUrl: "http://localhost:3000",
    });

    await assert.rejects(
      () => client.getPhrase("plain"),
      /500 Internal Server Error.*plain backend failure/
    );
  });
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

test("local node settings are created with defaults", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_settings_defaults"));
  const settings = store.getOrCreateLocalNodeSettings();

  assert.deepStrictEqual(
    {
      default_language_hint: settings.default_language_hint,
      default_safety_label: settings.default_safety_label,
      sync_mode: settings.sync_mode,
      developer_mode: settings.developer_mode,
      show_debug_panels: settings.show_debug_panels,
    },
    {
      default_language_hint: "und",
      default_safety_label: "normal",
      sync_mode: "manual",
      developer_mode: true,
      show_debug_panels: true,
    }
  );
  assert.strictEqual(typeof settings.updated_at, "number");
});

test("local node settings repeated reads return same values", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_settings_repeated"));
  const settings = store.getOrCreateLocalNodeSettings();
  const repeatedSettings = store.getOrCreateLocalNodeSettings();

  assert.deepStrictEqual(repeatedSettings, settings);
});

test("local node settings update editable fields", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_settings_update"));
  const initialSettings = store.getOrCreateLocalNodeSettings();
  const updatedSettings = store.updateLocalNodeSettings({
    default_language_hint: " en ",
    developer_mode: false,
    show_debug_panels: false,
  });

  assert.strictEqual(updatedSettings.default_language_hint, "en");
  assert.strictEqual(updatedSettings.default_safety_label, "normal");
  assert.strictEqual(updatedSettings.sync_mode, "manual");
  assert.strictEqual(updatedSettings.developer_mode, false);
  assert.strictEqual(updatedSettings.show_debug_panels, false);
  assert(updatedSettings.updated_at > initialSettings.updated_at);
});

test("local node settings reject invalid sync mode", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_settings_sync_mode"));

  assert.throws(
    () =>
      store.updateLocalNodeSettings({
        sync_mode: "auto" as unknown as "manual",
      }),
    /sync_mode must be manual/
  );
});


test("local KYC verifier alias registry creates stable local aliases", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_kyc_alias_stable"));
  const firstAlias = store.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: " real_verifier_node_001 ",
    display_name: "Known Friend",
  });
  const repeatedAlias = store.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: "real_verifier_node_001",
  });

  assert.match(
    firstAlias.verifier_alias_id,
    /^kyc_verifier_alias_[0-9a-f]{24}$/
  );
  assert.strictEqual(firstAlias.verifier_node_id, "real_verifier_node_001");
  assert.strictEqual(firstAlias.display_name, "Known Friend");
  assert.strictEqual(
    repeatedAlias.verifier_alias_id,
    firstAlias.verifier_alias_id
  );
  assert.strictEqual(
    repeatedAlias.verifier_node_id,
    firstAlias.verifier_node_id
  );
});

test("local KYC verifier alias registry updates display name without changing alias", () => {
  const store = new SQLiteStore(unitDbPath("unit_local_kyc_alias_update"));
  const firstAlias = store.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: "real_verifier_node_002",
    display_name: "Old Name",
  });
  const updatedAlias = store.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: "real_verifier_node_002",
    display_name: "New Name",
  });

  assert.strictEqual(
    updatedAlias.verifier_alias_id,
    firstAlias.verifier_alias_id
  );
  assert.strictEqual(updatedAlias.verifier_node_id, firstAlias.verifier_node_id);
  assert.strictEqual(updatedAlias.display_name, "New Name");
  assert(updatedAlias.updated_at > firstAlias.updated_at);
});

test("local KYC verifier alias registry persists after restart", () => {
  const dbPath = unitDbPath("unit_local_kyc_alias_restart");
  const firstStore = new SQLiteStore(dbPath);
  const firstAlias = firstStore.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: "real_verifier_node_003",
    display_name: "Restart Friend",
  });
  const restartedStore = new SQLiteStore(dbPath);
  const restartedAlias = restartedStore.getLocalKycVerifierAliasByNodeId(
    "real_verifier_node_003"
  );

  assert.deepStrictEqual(restartedAlias, firstAlias);
});

test("local KYC verifier alias registry is not stored in synced packets", () => {
  const engine = unitEngine("unit_local_kyc_alias_not_synced");
  const controller = new MyceliumController(engine);
  const alias = controller.getOrCreateLocalKycVerifierAlias({
    verifier_node_id: "real_verifier_node_004",
    display_name: "Private Friend",
  });
  const serializedLedger = JSON.stringify(engine.exportLedgerPackets());
  const listedAliases = controller.listLocalKycVerifierAliases();

  assert.strictEqual(engine.packetCount(), 0);
  assert(!serializedLedger.includes("real_verifier_node_004"));
  assert(!serializedLedger.includes("Private Friend"));
  assert(!serializedLedger.includes(alias.verifier_alias_id));
  assert.strictEqual(listedAliases.length, 1);
  assert.strictEqual(listedAliases[0].verifier_alias_id, alias.verifier_alias_id);
  assert.strictEqual(listedAliases[0].verifier_node_id, "real_verifier_node_004");
});

test("sqlite migrations create tracking table and apply stable IDs", () => {
  const db = new Database(":memory:");

  try {
    runSqliteMigrations(db);

    const table = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'schema_migrations'
      `
      )
      .get() as { name: string } | undefined;
    const applied = listAppliedSchemaMigrations(db);

    assert.strictEqual(table?.name, "schema_migrations");
    assert.deepStrictEqual(
      applied.map((migration) => migration.migration_id),
      SQLITE_MIGRATIONS.map((migration) => migration.migration_id)
    );
  } finally {
    db.close();
  }
});

test("sqlite migrations are idempotent on repeated startup", () => {
  const db = new Database(":memory:");

  try {
    runSqliteMigrations(db);
    const firstRun = listAppliedSchemaMigrations(db);

    runSqliteMigrations(db);
    const secondRun = listAppliedSchemaMigrations(db);

    assert.deepStrictEqual(secondRun, firstRun);
  } finally {
    db.close();
  }
});

test("sqlite migrations mark legacy compatible schema without data loss", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE packets (
        packet_id TEXT PRIMARY KEY,
        packet_type TEXT NOT NULL,
        zone TEXT NOT NULL,
        author TEXT NOT NULL,
        parent TEXT,
        phrase_id TEXT,
        meaning_id TEXT,
        symbol_id TEXT,
        payload_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        packet_json TEXT NOT NULL,
        packet_size_bytes INTEGER NOT NULL,
        packet_size_class TEXT NOT NULL,
        size_recommendation TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      );

      INSERT INTO packets (
        packet_id,
        packet_type,
        zone,
        author,
        payload_hash,
        payload_json,
        packet_json,
        packet_size_bytes,
        packet_size_class,
        size_recommendation,
        created_at,
        received_at
      )
      VALUES (
        'legacy_packet',
        'phrase_observed',
        'zone',
        'author',
        'hash',
        '{}',
        '{}',
        2,
        'tiny',
        'store',
        1,
        1
      );
    `);

    runSqliteMigrations(db);

    const packet = db
      .prepare(
        `
        SELECT packet_id
        FROM packets
        WHERE packet_id = 'legacy_packet'
      `
      )
      .get() as { packet_id: string } | undefined;
    const applied = listAppliedSchemaMigrations(db);

    assert.strictEqual(packet?.packet_id, "legacy_packet");
    assert.strictEqual(applied.length, SQLITE_MIGRATIONS.length);
  } finally {
    db.close();
  }
});

test("sqlite store lists applied schema migrations in stable order", () => {
  const store = new SQLiteStore(unitDbPath("unit_schema_migrations_list"));
  const applied = store.listAppliedSchemaMigrations();

  assert.deepStrictEqual(
    applied.map((migration) => migration.migration_id),
    SQLITE_MIGRATIONS.map((migration) => migration.migration_id)
  );

  for (const migration of applied) {
    assert.strictEqual(typeof migration.applied_at, "number");
  }
});

test("node status returns identity and durable packet count", () => {
  const engine = unitEngine("unit_node_status_identity");
  const controller = new MyceliumController(engine);

  engine.observePhrase({
    phrase_id: "unit_phrase_node_status",
    surface_text: "hello",
    language_hint: "en",
    input_type: "text",
  });

  const status = controller.getNodeStatus();

  assert.strictEqual(status.ok, true);
  assert.match(status.node.node_id, /^mycelium_node_[0-9a-f]{16}$/);
  assert.strictEqual(status.node.display_name, "Local Mycelium Node");
  assert.strictEqual(status.node.default_author, status.node.node_id);
  assert.strictEqual(status.service.name, "Mycelium");
  assert.strictEqual(status.service.status, "ready");
  assert.strictEqual(typeof status.service.uptime_seconds, "number");
  assert.strictEqual(typeof status.service.server_time, "number");
  assert.strictEqual(typeof status.ledger.packet_count, "number");
  assert(status.ledger.packet_count >= 1);
  assert.deepStrictEqual(status.settings, {
    sync_mode: "manual",
    developer_mode: true,
    show_debug_panels: true,
  });
});

test("node status reports tombstone execution as disabled", () => {
  const status = new MyceliumController(
    unitEngine("unit_node_status_tombstone_execution")
  ).getNodeStatus();

  assert.strictEqual(status.capabilities.tombstone_packets, true);
  assert.strictEqual(status.capabilities.tombstone_execution, false);
});

test("node status includes stable Mycelium version fields", () => {
  const status = new MyceliumController(
    unitEngine("unit_node_status_versions")
  ).getNodeStatus();

  assert.deepStrictEqual(status.versions, {
    api_version: MYCELIUM_API_VERSION,
    protocol_version: MYCELIUM_PROTOCOL_VERSION,
    app_contract_version: MYCELIUM_APP_CONTRACT_VERSION,
  });
});

test("node diagnostics reports versions, counts, and disabled destructive behavior", () => {
  const engine = unitEngine("unit_node_diagnostics");
  const controller = new MyceliumController(engine);

  engine.setPeerSyncCursor("diagnostic_peer", "0:");

  const diagnostics = controller.getNodeDiagnostics().diagnostics;

  assert.strictEqual(diagnostics.server_reachable, true);
  assert.deepStrictEqual(diagnostics.versions, {
    api_version: MYCELIUM_API_VERSION,
    protocol_version: MYCELIUM_PROTOCOL_VERSION,
    app_contract_version: MYCELIUM_APP_CONTRACT_VERSION,
  });
  assert.strictEqual(typeof diagnostics.ledger.packet_count, "number");
  assert.strictEqual(typeof diagnostics.ledger.migration_count, "number");
  assert.strictEqual(typeof diagnostics.sync.known_peer_count, "number");
  assert.strictEqual(diagnostics.sync.known_peer_count, 1);
  assert.strictEqual(diagnostics.safety.tombstone_execution, false);
  assert.strictEqual(diagnostics.safety.deletion_enabled, false);
  assert.strictEqual(diagnostics.safety.ledger_pruning_enabled, false);
});

test("node diagnostics does not create packets", () => {
  const engine = unitEngine("unit_node_diagnostics_read_only");
  const controller = new MyceliumController(engine);
  const packetCountBefore = engine.packetCount();

  controller.getNodeDiagnostics();

  assert.strictEqual(engine.packetCount(), packetCountBefore);
});

test("KYC event-only packets are stored without knowledge mutation", () => {
  const engine = unitEngine("kyc_event_only_packets");

  const claim = engine.createKycClaim({
    kyc_claim_id: "unit_kyc_claim_001",
    subject_node_id: "unit_subject_node_001",
    country_hint: "IN",
    document_type_hint: "government_id",
    consent_text_hash: "unit_consent_text_hash",
    consented_at: 1_000,
  });

  const evidence = engine.prepareKycEvidence(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      evidence_id: "unit_kyc_evidence_001",
      evidence_kinds: ["id_face_crop", "current_selfie", "liveness_video"],
      evidence_bundle_hash: "unit_minimized_evidence_bundle_hash",
      full_id_shared: false,
      retention_expires_at: 2_000,
    },
    claim.packet.packet_id
  );

  const aiAssessment = engine.completeKycAiAssessment(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      assessment_id: "unit_kyc_ai_assessment_001",
      result: "unsure",
      face_match_score: 0.72,
      liveness_score: 0.91,
      spoof_risk_score: 0.08,
      reason: "human review required",
    },
    evidence.packet.packet_id
  );

  const invite = engine.inviteKycKnownVerifier(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      verifier_alias_id: "unit_verified_friend_node_001",
      invite_id: "unit_kyc_invite_001",
      evidence_bundle_hash: "unit_minimized_evidence_bundle_hash",
      expires_at: 2_000,
    },
    aiAssessment.packet.packet_id
  );

  const vote = engine.voteKycKnownVerifier(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      invite_id: "unit_kyc_invite_001",
      verifier_alias_id: "unit_verified_friend_node_001",
      vote: "same_person",
      reason: "known person confirms match",
    },
    invite.packet.packet_id
  );

  const quorum = engine.recordKycQuorumResult(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      status: "needs_more_review",
      same_person_votes: 1,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "unsure",
      result_reason: "not enough known verifiers yet",
    },
    vote.packet.packet_id
  );

  const expiry = engine.expireKycEvidence(
    {
      kyc_claim_id: "unit_kyc_claim_001",
      evidence_id: "unit_kyc_evidence_001",
      expired_at: 2_001,
      deletion_proof_hash: "unit_evidence_deletion_proof_hash",
    },
    quorum.packet.packet_id
  );

  assert.strictEqual(claim.packet.packet_type, "kyc_claim_created");
  assert.strictEqual(evidence.packet.packet_type, "kyc_evidence_prepared");
  assert.strictEqual(
    aiAssessment.packet.packet_type,
    "kyc_ai_assessment_completed"
  );
  assert.strictEqual(invite.packet.packet_type, "kyc_known_verifier_invited");
  assert.strictEqual(vote.packet.packet_type, "kyc_known_verifier_vote");
  assert.strictEqual(quorum.packet.packet_type, "kyc_quorum_result");
  assert.strictEqual(expiry.packet.packet_type, "kyc_evidence_expired");

  assert.strictEqual(evidence.packet.payload.full_id_shared, false);
  assert.strictEqual(engine.packetCount(), 7);
  assert.deepStrictEqual(engine.listKnowledge(), []);
});


test("KYC known verifier packets reject raw verifier node IDs", () => {
  const engine = unitEngine("unit_kyc_reject_raw_verifier_node_ids");

  const legacyInvitePacket = createPacket({
    packet_type: "kyc_known_verifier_invited",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload: {
      kyc_claim_id: "unit_legacy_kyc_claim_001",
      verifier_node_id: "unit_raw_verifier_node_001",
      invite_id: "unit_legacy_kyc_invite_001",
      evidence_bundle_hash: "unit_legacy_evidence_bundle_hash",
      expires_at: 2_000,
    },
  });

  const legacyVotePacket = createPacket({
    packet_type: "kyc_known_verifier_vote",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload: {
      kyc_claim_id: "unit_legacy_kyc_claim_001",
      invite_id: "unit_legacy_kyc_invite_001",
      verifier_node_id: "unit_raw_verifier_node_001",
      vote: "same_person",
    },
  });

  const importResult = engine.importLedgerPackets([
    legacyInvitePacket,
    legacyVotePacket,
  ]);

  assert.deepStrictEqual(importResult, {
    accepted_new_count: 0,
    already_stored_count: 0,
    rejected_invalid_count: 2,
    rejected_expired_count: 0,
    failed_count: 0,
  });
  assert.strictEqual(engine.packetCount(), 0);
  assert.strictEqual(engine.listKnowledge().length, 0);
});

test("KYC claim summary reports current claim state", () => {
  const engine = unitEngine("unit_kyc_claim_summary");
  const controller = new MyceliumController(engine);
  const claimId = "unit_kyc_claim_summary_001";

  const claim = engine.createKycClaim({
    kyc_claim_id: claimId,
    subject_node_id: "unit_subject_node_summary_001",
    country_hint: "IN",
    document_type_hint: "government_id",
    consent_text_hash: "unit_consent_text_hash_summary",
    consented_at: 1_000,
  });

  const evidence = engine.prepareKycEvidence(
    {
      kyc_claim_id: claimId,
      evidence_id: "unit_kyc_evidence_summary_001",
      evidence_kinds: ["id_face_crop", "current_selfie", "liveness_video"],
      evidence_bundle_hash: "unit_minimized_evidence_bundle_hash_summary",
      full_id_shared: false,
      retention_expires_at: 2_000,
    },
    claim.packet.packet_id
  );

  const aiAssessment = engine.completeKycAiAssessment(
    {
      kyc_claim_id: claimId,
      assessment_id: "unit_kyc_ai_assessment_summary_001",
      result: "unsure",
      face_match_score: 0.7,
      liveness_score: 0.9,
      spoof_risk_score: 0.1,
      reason: "human review required",
    },
    evidence.packet.packet_id
  );

  const invite = engine.inviteKycKnownVerifier(
    {
      kyc_claim_id: claimId,
      verifier_alias_id: "unit_verifier_alias_summary_001",
      invite_id: "unit_kyc_invite_summary_001",
      evidence_bundle_hash: "unit_minimized_evidence_bundle_hash_summary",
      expires_at: 2_000,
    },
    aiAssessment.packet.packet_id
  );

  const firstVote = engine.voteKycKnownVerifier(
    {
      kyc_claim_id: claimId,
      invite_id: "unit_kyc_invite_summary_001",
      verifier_alias_id: "unit_verifier_alias_summary_001",
      vote: "unsure",
      reason: "old ID photo",
    },
    invite.packet.packet_id
  );

  const latestVote = engine.voteKycKnownVerifier(
    {
      kyc_claim_id: claimId,
      invite_id: "unit_kyc_invite_summary_001",
      verifier_alias_id: "unit_verifier_alias_summary_001",
      vote: "same_person",
      reason: "video confirms identity continuity",
    },
    firstVote.packet.packet_id
  );

  const quorum = engine.recordKycQuorumResult(
    {
      kyc_claim_id: claimId,
      status: "needs_more_review",
      same_person_votes: 1,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "unsure",
      result_reason: "more known verifiers needed",
    },
    latestVote.packet.packet_id
  );

  engine.expireKycEvidence(
    {
      kyc_claim_id: claimId,
      evidence_id: "unit_kyc_evidence_summary_001",
      expired_at: 2_001,
      deletion_proof_hash: "unit_summary_deletion_proof_hash",
    },
    quorum.packet.packet_id
  );

  const summary = controller.getKycClaimSummary(claimId);

  assert.strictEqual(summary.found, true);

  if (!summary.found) {
    throw new Error("Expected KYC summary to be found");
  }

  assert.strictEqual(summary.kyc_claim_id, claimId);
  assert.strictEqual(summary.subject_node_id, "unit_subject_node_summary_001");
  assert.strictEqual(summary.country_hint, "IN");
  assert.strictEqual(summary.document_type_hint, "government_id");
  assert.strictEqual(summary.status, "needs_more_review");
  assert.strictEqual(summary.is_kyc_verified, false);
  assert.strictEqual(summary.packet_count, 8);
  assert.strictEqual(summary.evidence_count, 1);
  assert.deepStrictEqual(summary.evidence_bundle_hashes, [
    "unit_minimized_evidence_bundle_hash_summary",
  ]);
  assert.strictEqual(summary.full_id_shared, false);
  assert.strictEqual(summary.evidence_expired, true);
  assert.deepStrictEqual(summary.expired_evidence_ids, [
    "unit_kyc_evidence_summary_001",
  ]);
  assert.strictEqual(summary.latest_ai_result, "unsure");
  assert.strictEqual(summary.known_verifier_invite_count, 1);
  assert.deepStrictEqual(summary.known_verifier_vote_counts, {
    same_person: 1,
    not_same_person: 0,
    unsure: 0,
    suspicious: 0,
    low_quality: 0,
  });
  const serializedSummary = JSON.stringify(summary);

  assert(
    !serializedSummary.includes("unit_verifier_alias_summary_001"),
    "KYC claim summary hides known verifier identifiers"
  );
  assert(
    !serializedSummary.includes("unit_kyc_invite_summary_001"),
    "KYC claim summary hides verifier invite identifiers"
  );
  assert.strictEqual(summary.latest_quorum_reason, "more known verifiers needed");
});


test("KYC claim summary exposes verified gate from quorum result", () => {
  const engine = unitEngine("unit_kyc_claim_summary_verified_gate");
  const controller = new MyceliumController(engine);
  const claimId = "unit_kyc_claim_verified_gate_001";

  const claim = engine.createKycClaim({
    kyc_claim_id: claimId,
    subject_node_id: "unit_subject_node_verified_gate_001",
    country_hint: "IN",
    document_type_hint: "government_id",
    consent_text_hash: "unit_verified_gate_consent_hash",
    consented_at: 1_000,
  });

  engine.recordKycQuorumResult(
    {
      kyc_claim_id: claimId,
      status: "verified",
      same_person_votes: 3,
      not_same_person_votes: 0,
      unsure_votes: 0,
      suspicious_votes: 0,
      ai_result: "pass",
      result_reason: "required quorum reached",
    },
    claim.packet.packet_id
  );

  const summary = controller.getKycClaimSummary(claimId);

  assert.strictEqual(summary.found, true);

  if (!summary.found) {
    throw new Error("Expected KYC summary to be found");
  }

  assert.strictEqual(summary.status, "verified");
  assert.strictEqual(summary.is_kyc_verified, true);
  assert.strictEqual(summary.latest_quorum_reason, "required quorum reached");
});

test("KYC claim summary reports missing claims without mutation", () => {
  const engine = unitEngine("unit_kyc_claim_summary_missing");
  const controller = new MyceliumController(engine);
  const packetCountBefore = engine.packetCount();

  const summary = controller.getKycClaimSummary("missing_kyc_claim");

  assert.deepStrictEqual(summary, {
    found: false,
    kyc_claim_id: "missing_kyc_claim",
    packet_count: 0,
    is_kyc_verified: false,
  });
  assert.strictEqual(engine.packetCount(), packetCountBefore);
});


test("payment intent packets are event-only and require KYC claim references", () => {
  const engine = unitEngine("unit_payment_intent_event_only");
  const result = engine.createPaymentIntent({
    payment_intent_id: "unit_payment_intent_001",
    order_reference_id: "unit_order_001",
    buyer_subject_node_id: "unit_buyer_subject_node_001",
    vendor_subject_node_id: "unit_vendor_subject_node_001",
    buyer_kyc_claim_id: "unit_buyer_kyc_claim_001",
    vendor_kyc_claim_id: "unit_vendor_kyc_claim_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 12345,
    created_at: 1_000,
    memo: "intent only; external payment rail handles money movement",
  });

  assert.strictEqual(result.packet.packet_type, "payment_intent_created");
  assert.strictEqual(engine.packetCount(), 1);
  assert.strictEqual(engine.listKnowledge().length, 0);
  assert.deepStrictEqual(result.packet.payload, {
    payment_intent_id: "unit_payment_intent_001",
    order_reference_id: "unit_order_001",
    buyer_subject_node_id: "unit_buyer_subject_node_001",
    vendor_subject_node_id: "unit_vendor_subject_node_001",
    buyer_kyc_claim_id: "unit_buyer_kyc_claim_001",
    vendor_kyc_claim_id: "unit_vendor_kyc_claim_001",
    external_rail: "upi",
    currency_code: "INR",
    amount_minor_units: 12345,
    created_at: 1_000,
    memo: "intent only; external payment rail handles money movement",
  });
});

test("payment intent packets reject invalid rail and amount on import", () => {
  const engine = unitEngine("unit_payment_intent_invalid_import");
  const invalidPaymentIntent = createPacket({
    packet_type: "payment_intent_created",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload: {
      payment_intent_id: "unit_payment_intent_invalid_001",
      order_reference_id: "unit_order_invalid_001",
      buyer_subject_node_id: "unit_buyer_subject_node_invalid_001",
      vendor_subject_node_id: "unit_vendor_subject_node_invalid_001",
      buyer_kyc_claim_id: "unit_buyer_kyc_claim_invalid_001",
      vendor_kyc_claim_id: "unit_vendor_kyc_claim_invalid_001",
      external_rail: "cash_under_table",
      currency_code: "INR",
      amount_minor_units: 0,
      created_at: 1_000,
    },
  });

  const importResult = engine.importLedgerPackets([invalidPaymentIntent]);

  assert.strictEqual(importResult.rejected_invalid_count, 1);
  assert.strictEqual(engine.packetCount(), 0);
});

test("ledger export returns durable packets without mutating count", () => {
  const engine = unitEngine("unit_ledger_export_read_only");
  const packet = engine.observePhrase({
    phrase_id: "unit_phrase_ledger_export",
    surface_text: "ledger export",
    language_hint: "en",
    input_type: "text",
  }).packet;
  const packetCountBefore = engine.packetCount();
  const packets = engine.exportLedgerPackets();

  assert.strictEqual(packets.length, packetCountBefore);
  assert.strictEqual(packets[0].packet_id, packet.packet_id);
  assert.strictEqual(engine.packetCount(), packetCountBefore);
});

test("ledger import counts new and duplicate packets", () => {
  const sourceEngine = unitEngine("unit_ledger_import_source");
  sourceEngine.observePhrase({
    phrase_id: "unit_phrase_ledger_import_duplicate",
    surface_text: "ledger import duplicate",
    language_hint: "en",
    input_type: "text",
  });

  const targetEngine = unitEngine("unit_ledger_import_target");
  const packets = sourceEngine.exportLedgerPackets();
  const firstImport = targetEngine.importLedgerPackets(packets);
  const secondImport = targetEngine.importLedgerPackets(packets);

  assert.deepStrictEqual(firstImport, {
    accepted_new_count: 1,
    already_stored_count: 0,
    rejected_invalid_count: 0,
    rejected_expired_count: 0,
    failed_count: 0,
  });
  assert.deepStrictEqual(secondImport, {
    accepted_new_count: 0,
    already_stored_count: 1,
    rejected_invalid_count: 0,
    rejected_expired_count: 0,
    failed_count: 0,
  });
  assert.strictEqual(targetEngine.packetCount(), 1);
});

test("ledger import rejects invalid and expired packets through receive path", () => {
  const engine = unitEngine("unit_ledger_import_rejections");
  const expiredPacket = createPacket({
    packet_type: "phrase_observed",
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    expires_at: Math.floor(Date.now() / 1000) - 10,
    payload: {
      phrase_id: "unit_phrase_ledger_import_expired",
      surface_text: "expired",
      language_hint: "en",
      input_type: "text",
    },
  });
  const invalidPacket = {
    version: "lmp/0.1",
    packet_id: "not_a_valid_packet_id",
    packet_type: "phrase_observed",
    created_at: Math.floor(Date.now() / 1000),
    zone: TEST_ZONE,
    author: TEST_AUTHOR,
    payload_hash: "not_a_valid_payload_hash",
    payload: {
      phrase_id: "unit_phrase_ledger_import_invalid",
      input_type: "text",
    },
    signature: "not_a_valid_signature",
  };
  const result = engine.importLedgerPackets([invalidPacket, expiredPacket]);

  assert.deepStrictEqual(result, {
    accepted_new_count: 0,
    already_stored_count: 0,
    rejected_invalid_count: 1,
    rejected_expired_count: 1,
    failed_count: 0,
  });
  assert.strictEqual(engine.packetCount(), 0);
});

test("ledger HTTP export returns packet count and packet array", async () => {
  const engine = unitEngine("unit_ledger_http_export");
  engine.observePhrase({
    phrase_id: "unit_phrase_ledger_http_export",
    surface_text: "ledger HTTP export",
    language_hint: "en",
    input_type: "text",
  });
  const packetCountBefore = engine.packetCount();

  await withUnitHttpServer(engine, "unit_ledger_http_export", async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ledger/export`);
    const body = (await response.json()) as {
      ok: true;
      packet_count: number;
      packets: unknown[];
    };

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.packet_count, packetCountBefore);
    assert(Array.isArray(body.packets));
    assert.strictEqual(body.packets.length, packetCountBefore);
  });

  assert.strictEqual(engine.packetCount(), packetCountBefore);
});

test("ledger HTTP import rejects non-array packets with stable error", async () => {
  const engine = unitEngine("unit_ledger_http_import_validation");

  await withUnitHttpServer(
    engine,
    "unit_ledger_http_import_validation",
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ledger/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          packets: "not an array",
        }),
      });
      const body = (await response.json()) as {
        ok: false;
        error: {
          code: string;
          message: string;
        };
      };

      assert.strictEqual(response.status, 400);
      assert.deepStrictEqual(body, {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "packets must be an array",
        },
      });
    }
  );
});

test("sync status returns local peer cursor array", () => {
  const engine = unitEngine("unit_sync_status_peer_list");
  const controller = new MyceliumController(engine);

  engine.setPeerSyncCursor("peer_author_a", "10:packet_a");

  const status = controller.getSyncStatus();

  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.sync.enabled, true);
  assert.strictEqual(status.sync.mode, "manual");
  assert.strictEqual(status.sync.known_peer_count, 1);
  assert(Array.isArray(status.sync.peers));
  assert.strictEqual(status.sync.peers[0].peer_author, "peer_author_a");
  assert.strictEqual(status.sync.peers[0].cursor, "10:packet_a");
  assert.strictEqual(typeof status.sync.peers[0].updated_at, "number");
});

test("sync status does not run packet sync", () => {
  let pullSyncBatchCalled = false;
  const fakeEngine = {
    sqliteStore: {
      listPeerSyncCursors: () => [
        {
          peer_author: "peer_author_local_only",
          cursor: "0:",
          updated_at: 0,
        },
      ],
    },
    pullSyncBatch: () => {
      pullSyncBatchCalled = true;
      throw new Error("sync status must not pull packets");
    },
  } as unknown as LanguageEngine;

  const status = new MyceliumController(fakeEngine).getSyncStatus();

  assert.strictEqual(pullSyncBatchCalled, false);
  assert.strictEqual(status.sync.known_peer_count, 1);
  assert.strictEqual(
    status.sync.peers[0].peer_author,
    "peer_author_local_only"
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

test("correction tombstone duplicate voter protection counts latest vote only", () => {
  const phraseId = "unit_phrase_tombstone_duplicate_votes";
  const correctionId = "unit_correction_tombstone_duplicate_votes";
  const tombstoneId = "unit_tombstone_duplicate_votes";

  const packets = [
    createPacket({
      packet_type: "meaning_correction_tombstone_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        tombstone_id: tombstoneId,
        reason: "spam",
      },
    }),
    {
      ...createPacket({
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
      created_at: 1000,
      packet_id: "unit_tombstone_vote_confirm_001",
    },
    {
      ...createPacket({
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
      created_at: 2000,
      packet_id: "unit_tombstone_vote_reject_002",
    },
  ];

  const tombstones = summarizeTombstonePacketsForPhrase(phraseId, packets);

  assert.strictEqual(tombstones.length, 1);
  assert.strictEqual(tombstones[0].confirm_votes, 0);
  assert.strictEqual(tombstones[0].reject_votes, 1);
  assert.strictEqual(tombstones[0].tombstone_score, -1);
  assert.strictEqual(tombstones[0].status, "maturing");
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

test("meaning explanation reports disabled tombstone execution and evidence counts", () => {
  const phraseId = "unit_phrase_meaning_explanation";
  const originalMeaningId = "unit_meaning_explanation_original";
  const phrase: KnowledgePhraseRecord = {
    phrase_id: phraseId,
    surface_text: "explain this",
    language_hint: "en",
    safety_label: "normal",
    meanings: [
      {
        meaning_id: originalMeaningId,
        reference_meaning: "Base meaning.",
        confidence: 0.4,
        confirms: 0,
        rejects: 0,
      },
    ],
  };
  const correctionPackets = [
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "unit_explanation_confirmed",
      confirmVotes: 3,
    }),
    ...correctionPacketsWithVotes({
      phraseId,
      originalMeaningId,
      correctionId: "unit_explanation_maturing",
      confirmVotes: 1,
    }),
  ];
  const tombstonePackets = tombstonePacketsWithVotes({
    phraseId,
    correctionId: "unit_explanation_confirmed",
    tombstoneId: "unit_explanation_tombstone",
    confirmVotes: 3,
  });
  const corrections = summarizeCorrectionPacketsForPhrase(
    phraseId,
    correctionPackets
  );
  const tombstones = summarizeTombstonePacketsForPhrase(
    phraseId,
    tombstonePackets
  );
  const bestMeaning = selectBestMeaning(
    phrase,
    phraseId,
    correctionPackets
  );
  const explanation = buildBestMeaningExplanation({
    phraseId,
    phrase,
    bestMeaningResult: bestMeaning,
    corrections,
    tombstones,
  });

  assert.strictEqual(
    explanation.explanation.tombstone_execution_enabled,
    false
  );
  assert.strictEqual(explanation.best_meaning?.source, "correction");
  assert.strictEqual(explanation.evidence.meaning_count, 1);
  assert.strictEqual(explanation.evidence.correction_count, 2);
  assert.strictEqual(explanation.evidence.confirmed_correction_count, 1);
  assert.strictEqual(explanation.evidence.maturing_correction_count, 1);
  assert.strictEqual(explanation.evidence.tombstone_count, 1);
  assert.strictEqual(explanation.evidence.confirmed_tombstone_count, 1);

  for (const value of Object.values(explanation.evidence)) {
    assert.strictEqual(typeof value, "number");
  }

  assert(
    explanation.explanation.reasons.some((reason) =>
      reason.includes("Tombstone execution is disabled")
    )
  );
  assert(
    explanation.explanation.reasons.some((reason) =>
      reason.includes("Correction evidence")
    )
  );
});

test("meaning explanation is read-only and leaves bestMeaning unchanged", () => {
  const phraseId = "unit_phrase_meaning_explanation_read_only";
  const meaningId = "unit_meaning_explanation_read_only";
  const correctionId = "unit_correction_explanation_read_only";
  const tombstoneId = "unit_tombstone_explanation_read_only";
  const engine = unitEngine("unit_meaning_explanation_read_only");
  const controller = new MyceliumController(engine);

  controller.observePhrase({
    phrase_id: phraseId,
    surface_text: "read only explanation",
    language_hint: "en",
    input_type: "text",
  });
  controller.proposeMeaning({
    phrase_id: phraseId,
    meaning_id: meaningId,
    reference_meaning: "Base meaning.",
    confidence: 0.3,
  });
  controller.proposeMeaningCorrection({
    phrase_id: phraseId,
    original_meaning_id: meaningId,
    correction_id: correctionId,
    corrected_reference_meaning: "Corrected meaning.",
  });

  for (let index = 0; index < 3; index += 1) {
    controller.voteMeaningCorrection({
      phrase_id: phraseId,
      correction_id: correctionId,
      vote: "confirm",
      voter: `read_only_correction_voter_${index}`,
    });
  }

  controller.proposeMeaningCorrectionTombstone({
    phrase_id: phraseId,
    correction_id: correctionId,
    tombstone_id: tombstoneId,
    reason: "negative_score",
  });

  for (let index = 0; index < 3; index += 1) {
    controller.voteMeaningCorrectionTombstone({
      phrase_id: phraseId,
      correction_id: correctionId,
      tombstone_id: tombstoneId,
      vote: "confirm",
      voter: `read_only_tombstone_voter_${index}`,
    });
  }

  const packetCountBefore = controller.packetCount();
  const bestMeaningBefore = controller.getBestMeaning(phraseId);
  const explanation = controller.getBestMeaningExplanation(phraseId);
  const bestMeaningAfter = controller.getBestMeaning(phraseId);

  assert.strictEqual(controller.packetCount(), packetCountBefore);
  assert.deepStrictEqual(bestMeaningAfter, bestMeaningBefore);

  if (!explanation.found) {
    assert.fail("Expected explanation for existing phrase.");
  }

  assert.strictEqual(
    explanation.explanation.tombstone_execution_enabled,
    false
  );
  assert.strictEqual(explanation.evidence.confirmed_tombstone_count, 1);
  assert.strictEqual(bestMeaningAfter.best_meaning?.source, "correction");
});

test("packet trace for unknown phrase returns empty read-only trace", () => {
  const engine = unitEngine("unit_packet_trace_unknown");
  const controller = new MyceliumController(engine);
  const packetCountBefore = controller.packetCount();
  const trace = controller.getPhrasePacketTrace("missing_phrase_trace");

  assert.strictEqual(trace.phrase_id, "missing_phrase_trace");
  assert.strictEqual(trace.trace.packet_count, 0);
  assert.deepStrictEqual(trace.trace.packet_types, {});
  assert.deepStrictEqual(trace.trace.packets, []);
  assert.strictEqual(trace.safety.tombstone_execution, false);
  assert.strictEqual(trace.safety.deletion_enabled, false);
  assert.strictEqual(trace.safety.ledger_pruning_enabled, false);
  assert.strictEqual(controller.packetCount(), packetCountBefore);
});

test("packet trace includes phrase, meaning, correction, and tombstone packets", () => {
  const phraseId = "unit_phrase_packet_trace";
  const meaningId = "unit_meaning_packet_trace";
  const correctionId = "unit_correction_packet_trace";
  const tombstoneId = "unit_tombstone_packet_trace";
  const engine = unitEngine("unit_packet_trace_full");
  const controller = new MyceliumController(engine);

  controller.observePhrase({
    phrase_id: phraseId,
    surface_text: "packet trace phrase",
    language_hint: "en",
    input_type: "text",
  });
  controller.proposeMeaning({
    phrase_id: phraseId,
    meaning_id: meaningId,
    reference_meaning: "Traceable meaning.",
    confidence: 0.7,
  });
  controller.voteMeaning({
    phrase_id: phraseId,
    meaning_id: meaningId,
    vote: "confirm",
    confidence: 0.8,
  });
  controller.applySafetyLabel({
    phrase_id: phraseId,
    label: "mild_slang",
  });
  controller.proposeMeaningCorrection({
    phrase_id: phraseId,
    original_meaning_id: meaningId,
    correction_id: correctionId,
    corrected_reference_meaning: "Traceable correction.",
  });
  controller.voteMeaningCorrection({
    phrase_id: phraseId,
    correction_id: correctionId,
    vote: "confirm",
    voter: "packet_trace_correction_voter",
  });
  controller.proposeMeaningCorrectionTombstone({
    phrase_id: phraseId,
    correction_id: correctionId,
    tombstone_id: tombstoneId,
    reason: "spam",
  });
  controller.voteMeaningCorrectionTombstone({
    phrase_id: phraseId,
    correction_id: correctionId,
    tombstone_id: tombstoneId,
    vote: "reject",
    voter: "packet_trace_tombstone_voter",
  });

  const packetCountBefore = controller.packetCount();
  const bestMeaningBefore = controller.getBestMeaning(phraseId);
  const trace = controller.getPhrasePacketTrace(phraseId);
  const bestMeaningAfter = controller.getBestMeaning(phraseId);

  assert.strictEqual(controller.packetCount(), packetCountBefore);
  assert.deepStrictEqual(bestMeaningAfter, bestMeaningBefore);
  assert.strictEqual(trace.trace.packet_count, 8);
  assert.strictEqual(trace.trace.packet_types.phrase_observed, 1);
  assert.strictEqual(trace.trace.packet_types.meaning_proposal, 1);
  assert.strictEqual(trace.trace.packet_types.meaning_vote, 1);
  assert.strictEqual(trace.trace.packet_types.safety_label, 1);
  assert.strictEqual(trace.trace.packet_types.meaning_correction_proposed, 1);
  assert.strictEqual(trace.trace.packet_types.meaning_correction_vote, 1);
  assert.strictEqual(
    trace.trace.packet_types.meaning_correction_tombstone_proposed,
    1
  );
  assert.strictEqual(
    trace.trace.packet_types.meaning_correction_tombstone_vote,
    1
  );
  assert.deepStrictEqual(
    [...trace.trace.packets.map((packet) => packet.role)].sort(),
    [
      "correction_proposal",
      "correction_vote",
      "meaning_proposal",
      "meaning_vote",
      "phrase_observation",
      "safety_label",
      "tombstone_proposal",
      "tombstone_vote",
    ].sort()
  );
  assert(
    trace.trace.packets.some(
      (packet) =>
        packet.correction_id === correctionId &&
        packet.summary.includes("correction")
    )
  );
  assert(
    trace.trace.packets.some(
      (packet) =>
        packet.tombstone_id === tombstoneId &&
        packet.summary.includes("tombstone")
    )
  );
  assert.strictEqual(trace.safety.tombstone_execution, false);
});

test("correction voter duplicate protection counts latest identified voter vote only", () => {
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
    {
      ...createPacket({
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
      created_at: 1000,
      packet_id: "unit_correction_vote_confirm_001",
    },
    {
      ...createPacket({
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
      created_at: 2000,
      packet_id: "unit_correction_vote_reject_002",
    },
  ];

  const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);

  assert.strictEqual(corrections.length, 1);
  assert.strictEqual(corrections[0].confirm_votes, 0);
  assert.strictEqual(corrections[0].reject_votes, 1);
  assert.strictEqual(corrections[0].correction_score, -1);
  assert.strictEqual(corrections[0].status, "maturing");
});

test("correction voter tiebreaker uses packet id when timestamps match", () => {
  const phraseId = "unit_phrase_same_time_voter_tiebreak";
  const correctionId = "unit_correction_same_time_voter_tiebreak";
  const sameCreatedAt = 424242;
  const voter = "unit_same_time_voter";

  const proposalPacket = {
    ...createPacket({
      packet_type: "meaning_correction_proposed",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        original_meaning_id: "unit_original_same_time_voter_tiebreak",
        correction_id: correctionId,
        corrected_reference_meaning:
          "Corrected meaning used to prove deterministic same-time voter tiebreaking.",
      },
    }),
    packet_id: "packet_same_time_correction_proposal",
    created_at: sameCreatedAt - 1,
  };

  const lowerPacketIdConfirm = {
    ...createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        vote: "confirm",
        voter,
      },
    }),
    packet_id: "aaa_same_time_confirm_vote",
    created_at: sameCreatedAt,
  };

  const higherPacketIdReject = {
    ...createPacket({
      packet_type: "meaning_correction_vote",
      zone: TEST_ZONE,
      author: TEST_AUTHOR,
      payload: {
        phrase_id: phraseId,
        correction_id: correctionId,
        vote: "reject",
        voter,
      },
    }),
    packet_id: "zzz_same_time_reject_vote",
    created_at: sameCreatedAt,
  };

  for (const packets of [
    [proposalPacket, lowerPacketIdConfirm, higherPacketIdReject],
    [proposalPacket, higherPacketIdReject, lowerPacketIdConfirm],
  ]) {
    const corrections = summarizeCorrectionPacketsForPhrase(phraseId, packets);

    assert.strictEqual(corrections.length, 1);
    assert.strictEqual(corrections[0].confirm_votes, 0);
    assert.strictEqual(corrections[0].reject_votes, 1);
    assert.strictEqual(corrections[0].correction_score, -1);
  }
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


test("language confidence gives half weight to anonymous votes", () => {
  const counts = countUniqueVoterVotes([
    {
      target_key: "anonymous_vote_target",
      vote: "confirm",
      created_at: 1,
      packet_id: "anonymous_vote_packet",
    },
    {
      target_key: "anonymous_vote_target",
      voter_id: "identified_voter",
      vote: "confirm",
      created_at: 2,
      packet_id: "identified_vote_packet",
    },
  ]);

  assert.deepStrictEqual(counts.get("anonymous_vote_target"), {
    confirm_votes: 1.5,
    reject_votes: 0,
  });

  const score = calculateMeaningScore({
    confidence: 0,
    confirms: 0.5,
    rejects: 0,
  });

  assert.strictEqual(score.confirms, 0.5);
  assert.strictEqual(score.total_votes, 0.5);
  assert(score.score > 0);
  assert(score.score < 0.5);
});

test("language confidence penalizes rejected meanings", () => {
  const score = calculateMeaningScore({
    confidence: 0.5,
    confirms: 0,
    rejects: 3,
  });

  assert(score.score < 0.5);
});


function unitCursorDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

test("sync cursor storage rejects direct backward cursor updates", () => {
  const engine = unitEngine("unit_sync_cursor_direct_backwards");
  const peerAuthor = "unit_sync_cursor_direct_peer";

  engine.setPeerSyncCursor(peerAuthor, "10:packet_a");
  engine.setPeerSyncCursor(peerAuthor, "10:packet_a");

  assert.strictEqual(
    engine.getPeerSyncCursor(peerAuthor).cursor,
    "10:packet_a"
  );

  assert.throws(
    () => engine.setPeerSyncCursor(peerAuthor, "9:packet_z"),
    /Refusing to move sync cursor backwards/
  );

  assert.strictEqual(
    engine.getPeerSyncCursor(peerAuthor).cursor,
    "10:packet_a"
  );

  engine.setPeerSyncCursor(peerAuthor, "11:packet_b");

  assert.strictEqual(
    engine.getPeerSyncCursor(peerAuthor).cursor,
    "11:packet_b"
  );
});

test("sync import rejects stale cursor batch without storing new packets", async () => {
  const nodeAAuthor = "unit_sync_cursor_import_node_a";
  const nodeBAuthor = "unit_sync_cursor_import_node_b";
  const nodeA = new LanguageEngine({
    zone: TEST_ZONE,
    author: nodeAAuthor,
    nodeAgeGroup: "adult",
    dbPath: unitDbPath("unit_sync_cursor_import_node_a"),
  });
  const nodeB = new LanguageEngine({
    zone: TEST_ZONE,
    author: nodeBAuthor,
    nodeAgeGroup: "adult",
    dbPath: unitDbPath("unit_sync_cursor_import_node_b"),
  });

  const firstPhrase = {
    phrase_id: "unit_sync_cursor_first_phrase",
    surface_text: "first cursor phrase",
    language_hint: "en",
    input_type: "text" as const,
  };
  const secondPhrase = {
    phrase_id: "unit_sync_cursor_second_phrase",
    surface_text: "second cursor phrase",
    language_hint: "en",
    input_type: "text" as const,
  };
  const thirdPhrase = {
    phrase_id: "unit_sync_cursor_third_phrase",
    surface_text: "third cursor phrase",
    language_hint: "en",
    input_type: "text" as const,
  };

  nodeA.observePhrase(firstPhrase);
  const firstBatch = nodeA.pullSyncBatch();
  const firstImport = nodeB.importSyncBatch({
    peerAuthor: nodeAAuthor,
    cursorBefore: firstBatch.cursor_before,
    cursorAfter: firstBatch.cursor_after,
    packets: firstBatch.packets,
  });
  const firstCursor = nodeB.getPeerSyncCursor(nodeAAuthor).cursor;

  assert.strictEqual(firstImport.summary.accepted_new, 1);
  assert.strictEqual(firstCursor, firstBatch.cursor_after);

  await unitCursorDelay(1100);

  nodeA.observePhrase(secondPhrase);
  const secondBatch = nodeA.pullSyncBatch(firstCursor);
  const secondImport = nodeB.importSyncBatch({
    peerAuthor: nodeAAuthor,
    cursorBefore: secondBatch.cursor_before,
    cursorAfter: secondBatch.cursor_after,
    packets: secondBatch.packets,
  });
  const latestCursor = nodeB.getPeerSyncCursor(nodeAAuthor).cursor;

  assert.strictEqual(secondImport.summary.accepted_new, 1);
  assert.strictEqual(latestCursor, secondBatch.cursor_after);

  await unitCursorDelay(1100);

  const thirdResult = nodeA.observePhrase(thirdPhrase);
  const staleBatch = nodeA.pullSyncBatch(firstCursor);

  assert(
    staleBatch.packets.some(
      (packet) => packet.packet_id === thirdResult.packet.packet_id
    )
  );

  let staleImportRejected = false;

  try {
    nodeB.importSyncBatch({
      peerAuthor: nodeAAuthor,
      cursorBefore: staleBatch.cursor_before,
      cursorAfter: staleBatch.cursor_after,
      packets: staleBatch.packets,
    });
  } catch {
    staleImportRejected = true;
  }

  assert.strictEqual(staleImportRejected, true);
  assert.strictEqual(
    nodeB.getPeerSyncCursor(nodeAAuthor).cursor,
    latestCursor
  );
  assert.strictEqual(
    nodeB.getPacketsByIds([thirdResult.packet.packet_id]).length,
    0
  );
  assert.strictEqual(
    nodeB
      .listKnowledge()
      .some((phrase) => phrase.phrase_id === thirdPhrase.phrase_id),
    false
  );
});

void runTests();

