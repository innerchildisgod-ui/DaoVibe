import express from "express";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { LanguageEngine } from "./engine";
import { LmpPacket } from "./protocol/packet";
import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
  SafetyLabelPayload,
} from "./protocol/packetTypes";
import { NodeAgeGroup } from "./safety/safetyGate";

const app = express();
app.use(express.json());
interface RemoteSyncPullResponse {
  ok: boolean;
  zone: string;
  from_author: string;
  cursor_before: string;
  cursor_after: string;
  packet_count: number;
  packets: LmpPacket[];
  error?: string;
}

function normalizeRemoteBaseUrl(remoteBaseUrl: string): string {
  return remoteBaseUrl.replace(/\/+$/, "");
}

function buildSyncPullUrl(
  remoteBaseUrl: string,
  cursor: string,
  limit: number
): string {
  const baseUrl = normalizeRemoteBaseUrl(remoteBaseUrl);
  const encodedCursor = encodeURIComponent(cursor);

  return `${baseUrl}/sync/pull?cursor=${encodedCursor}&limit=${limit}`;
}

function requestJson<T>(
  method: "GET" | "POST",
  urlString: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const request = client.request(
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
              const errorMessage =
                typeof parsed.error === "string"
                  ? parsed.error
                  : `HTTP ${response.statusCode}`;

              reject(new Error(errorMessage));
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

function readNodeAgeGroup(value: string | undefined): NodeAgeGroup {
  if (value === "child" || value === "adult") {
    return value;
  }

  return "adult";
}

const zone = process.env.CALLSAB_ZONE ?? "chennai_local_zone";
const author =
  process.env.CALLSAB_AUTHOR ?? "dev_public_key_laptop_001";
const nodeId = process.env.CALLSAB_NODE_ID ?? "node_laptop_001";
const nodeAgeGroup = readNodeAgeGroup(process.env.CALLSAB_NODE_AGE_GROUP);
const dbPath = process.env.CALLSAB_DB_PATH;
const port = Number(process.env.CALLSAB_PORT ?? 3000);

const engine = new LanguageEngine({
  zone,
  author,
  nodeAgeGroup,
  dbPath,
});

// Temporary dev nodes.
// Later these will come from real node discovery.
engine.addNode({
  node_id: nodeId,
  public_key: author,
  zone,
  roles: ["laptop_worker", "validator", "zone_index"],
  age_group: nodeAgeGroup,
  trusted_score: 0.92,
  online: true,
  supported_languages: ["Tamil", "Tamil-English slang", "English"],
  supported_regions: ["Chennai"],
  current_load: 0.2,
  last_seen: Math.floor(Date.now() / 1000),
});

engine.addNode({
  node_id: "node_phone_adult_001",
  public_key: "dev_public_key_phone_adult_001",
  zone,
  roles: ["phone_active"],
  age_group: "adult",
  trusted_score: 0.71,
  online: true,
  supported_languages: ["Tamil-English slang"],
  supported_regions: ["Chennai"],
  current_load: 0.4,
  last_seen: Math.floor(Date.now() / 1000),
});

engine.addNode({
  node_id: "node_phone_child_001",
  public_key: "dev_public_key_phone_child_001",
  zone,
  roles: ["phone_active"],
  age_group: "child",
  trusted_score: 0.4,
  online: true,
  supported_languages: ["Tamil-English slang"],
  supported_regions: ["Chennai"],
  current_load: 0.3,
  last_seen: Math.floor(Date.now() / 1000),
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "CallSab Language Engine",
    version: "lmp/0.1",
    status: "running",
    node: {
      node_id: nodeId,
      zone,
      author,
      node_age_group: nodeAgeGroup,
      db_path: dbPath ?? "data/callsab_language_engine.db",
      port,
    },
  });
});

app.get("/app/status", (_req, res) => {
  res.json({
    ok: true,
    app: {
      name: "CallSab",
      product_layer: "language_engine",
      mode: {
        local_first: true,
        offline_capable: true,
        online_sync_capable: true,
        p2p_future_capable: true,
      },
    },
    node: {
      node_id: nodeId,
      zone,
      author,
      node_age_group: nodeAgeGroup,
      db_path: dbPath ?? "data/callsab_language_engine.db",
      port,
    },
    local_state: {
      packet_count: engine.packetCount(),
      knowledge_count: engine.listKnowledge().length,
      known_node_count: engine.listNodes().length,
    },
    sync: {
      event_log_sync: true,
      change_only_packets: true,
      cursor_sync_available: true,
      inventory_sync_available: true,
    },
  });
});

app.post("/app/lookupPhrase", (req, res) => {
  const query = typeof req.body.query === "string" ? req.body.query.trim() : "";

  if (!query) {
    res.status(400).json({
      ok: false,
      error: "query is required",
    });
    return;
  }

  const normalizedQuery = query.toLowerCase();
  const matches = engine
    .listKnowledge()
    .filter(
      (phrase) =>
        phrase.surface_text?.toLowerCase().includes(normalizedQuery) ||
        phrase.phonetic_hint?.toLowerCase().includes(normalizedQuery) ||
        phrase.language_hint?.toLowerCase().includes(normalizedQuery)
    )
    .map((phrase) => ({
      phrase_id: phrase.phrase_id,
      surface_text: phrase.surface_text,
      phonetic_hint: phrase.phonetic_hint,
      language_hint: phrase.language_hint,
      safety_label: phrase.safety_label,
      meanings: phrase.meanings.map((meaning) => ({
        meaning_id: meaning.meaning_id,
        reference_meaning: meaning.reference_meaning,
        context: meaning.context,
        confidence: meaning.confidence,
        confirms: meaning.confirms,
        rejects: meaning.rejects,
      })),
    }));

  res.json({
    ok: true,
    query,
    match_count: matches.length,
    matches,
  });
});

app.post("/app/observePhrase", (req, res) => {
  try {
    const phraseId =
      typeof req.body.phrase_id === "string" ? req.body.phrase_id.trim() : "";
    const surfaceText =
      typeof req.body.surface_text === "string"
        ? req.body.surface_text.trim()
        : "";
    const phoneticHint =
      typeof req.body.phonetic_hint === "string"
        ? req.body.phonetic_hint.trim()
        : "";
    const languageHint =
      typeof req.body.language_hint === "string"
        ? req.body.language_hint.trim()
        : "";

    if (!phraseId) {
      res.status(400).json({
        ok: false,
        error: "phrase_id is required",
      });
      return;
    }

    if (!surfaceText && !phoneticHint && !languageHint) {
      res.status(400).json({
        ok: false,
        error: "at least one phrase text field is required",
      });
      return;
    }

    const payload: PhraseObservedPayload = {
      phrase_id: phraseId,
      surface_text: surfaceText || undefined,
      phonetic_hint: phoneticHint || undefined,
      language_hint: languageHint || undefined,
      input_type:
        typeof req.body.input_type === "string"
          ? (req.body.input_type as PhraseObservedPayload["input_type"])
          : "text",
    };
    const result = engine.observePhrase(payload);

    res.json({
      ok: true,
      result: {
        phrase_id: phraseId,
        packet_id: result.packet.packet_id,
        packet_type: result.packet.packet_type,
        created_at: result.packet.created_at,
        local_apply_status: "applied_to_knowledge",
        packet_size_class: result.packetSize.sizeClass,
        route_decision: result.packetRoute.decision,
      },
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/observePhrase", (req, res) => {
  try {
    const payload = req.body as PhraseObservedPayload;
    const result = engine.observePhrase(payload);

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/proposeMeaning", (req, res) => {
  try {
    const payload = req.body.payload as MeaningProposalPayload;
    const parent = req.body.parent as string | undefined;

    const result = engine.proposeMeaning(payload, parent);

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/voteMeaning", (req, res) => {
  try {
    const payload = req.body.payload as MeaningVotePayload;
    const parent = req.body.parent as string | undefined;

    const result = engine.voteMeaning(payload, parent);

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/applySafetyLabel", (req, res) => {
  try {
    const payload = req.body.payload as SafetyLabelPayload;
    const parent = req.body.parent as string | undefined;

    const result = engine.applySafetyLabel(payload, parent);

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/listKnowledge", (_req, res) => {
  res.json({
    ok: true,
    knowledge: engine.listKnowledge(),
  });
});

app.get("/nodes", (_req, res) => {
  res.json({
    ok: true,
    nodes: engine.listNodes(),
  });
});

app.get("/packetCount", (_req, res) => {
  res.json({
    ok: true,
    count: engine.packetCount(),
  });
});

app.get("/packetSummaries", (req, res) => {
  const limit = Number(req.query.limit ?? 100);

  res.json({
    ok: true,
    packets: engine.listPacketSummaries(limit),
  });
});

app.get("/packetsAfter", (req, res) => {
  const receivedAfter = Number(req.query.receivedAfter ?? 0);
  const limit = Number(req.query.limit ?? 100);

  res.json({
    ok: true,
    packets: engine.listPacketsAfter(receivedAfter, limit),
  });
});

app.get("/sync/pull", (req, res) => {
  try {
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : "0:";
    const limit = Number(req.query.limit ?? 100);
    const batch = engine.pullSyncBatch(cursor, limit);

    res.json({
      ok: true,
      zone,
      from_author: author,
      ...batch,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/packetsByIds", (req, res) => {
  const packetIds = Array.isArray(req.body.packet_ids)
    ? req.body.packet_ids
    : [];

  res.json({
    ok: true,
    packets: engine.getPacketsByIds(packetIds),
  });
});

app.get("/sync/cursor/:peerAuthor", (req, res) => {
  try {
    res.json({
      ok: true,
      cursor: engine.getPeerSyncCursor(req.params.peerAuthor),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/sync/cursor/:peerAuthor", (req, res) => {
  try {
    const cursor =
      typeof req.body.cursor === "string" ? req.body.cursor : "0:";

    res.json({
      ok: true,
      cursor: engine.setPeerSyncCursor(req.params.peerAuthor, cursor),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/sync/missingPacketIds", (req, res) => {
  try {
    const packetIds = Array.isArray(req.body.packet_ids)
      ? req.body.packet_ids.filter(
          (packetId: unknown): packetId is string =>
            typeof packetId === "string"
        )
      : [];
    const missingPacketIds = engine.findMissingPacketIds(packetIds);

    res.json({
      ok: true,
      input_count: packetIds.length,
      known_count: packetIds.length - missingPacketIds.length,
      missing_count: missingPacketIds.length,
      missing_packet_ids: missingPacketIds,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/sync/importBatch", (req, res) => {
  try {
    const peerAuthor =
      typeof req.body.peer_author === "string" ? req.body.peer_author : "";
    const cursorBefore =
      typeof req.body.cursor_before === "string" ? req.body.cursor_before : "";
    const cursorAfter =
      typeof req.body.cursor_after === "string" ? req.body.cursor_after : "";
    const packets = Array.isArray(req.body.packets)
      ? (req.body.packets as LmpPacket[])
      : [];

    if (!peerAuthor) {
      throw new Error("peer_author is required");
    }

    if (!cursorBefore) {
      throw new Error("cursor_before is required");
    }

    if (!cursorAfter) {
      throw new Error("cursor_after is required");
    }

    const result = engine.importSyncBatch({
      peerAuthor,
      cursorBefore,
      cursorAfter,
      packets,
    });

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/sync/run", async (req, res) => {
  try {
    const remoteBaseUrl =
      typeof req.body.remote_base_url === "string"
        ? req.body.remote_base_url
        : "";
    const peerAuthor =
      typeof req.body.peer_author === "string" ? req.body.peer_author : "";
    const limit = Number(req.body.limit ?? 100);

    if (!remoteBaseUrl) {
      throw new Error("remote_base_url is required");
    }

    if (!peerAuthor) {
      throw new Error("peer_author is required");
    }

    const savedCursor = engine.getPeerSyncCursor(peerAuthor);
    const pullUrl = buildSyncPullUrl(remoteBaseUrl, savedCursor.cursor, limit);
    const pulledBatch = await requestJson<RemoteSyncPullResponse>(
      "GET",
      pullUrl
    );

    if (!pulledBatch.ok) {
      throw new Error(pulledBatch.error ?? "Remote sync pull failed");
    }

    if (pulledBatch.from_author !== peerAuthor) {
      throw new Error(
        `Remote author mismatch. Expected ${peerAuthor}, received ${pulledBatch.from_author}`
      );
    }

    const result = engine.importSyncBatch({
      peerAuthor,
      cursorBefore: pulledBatch.cursor_before,
      cursorAfter: pulledBatch.cursor_after,
      packets: pulledBatch.packets,
    });

    res.json({
      ok: true,
      remote_base_url: normalizeRemoteBaseUrl(remoteBaseUrl),
      peer_author: peerAuthor,
      saved_cursor_before: savedCursor.cursor,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/receivePacket", (req, res) => {
  try {
    const result = engine.receivePacket(req.body);

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(`CallSab Language Engine running on http://localhost:${port}`);
  console.log(`Node ID: ${nodeId}`);
  console.log(`Author: ${author}`);
  console.log(`Zone: ${zone}`);
  console.log(`DB: ${dbPath ?? "data/callsab_language_engine.db"}`);
});
