import assert from "assert";
import Database from "better-sqlite3";
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
import { test, runTests } from "./testHarness";
import { calculateMeaningScore } from "../mycelium/LanguageConfidence";
import { SQLiteStore, type KnowledgePhraseRecord } from "../storage/sqliteStore";
import {
  listAppliedSchemaMigrations,
  runSqliteMigrations,
  SQLITE_MIGRATIONS,
} from "../storage/sqliteMigrations";
import { buildClientUrl } from "../client/clientUrl";
import { MyceliumClient, MyceliumClientError } from "../client/MyceliumClient";

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

