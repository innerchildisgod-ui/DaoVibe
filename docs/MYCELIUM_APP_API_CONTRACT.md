# Mycelium App API Contract

This document describes the app-facing DAOVibe Mycelium API contract currently exposed by the server. It is a documentation contract only: it does not add routes, change route paths, change packet validation, add storage schema, or change sync behavior.

Mycelium is the active language layer of the DAOVibe ecosystem. The routes below are the stable app and node API surface for this build.

## Contract Guarantees

- JSON responses use a top-level `ok` boolean.
- Validation failures return `ok: false` with an `error` string.
- App convenience writes under `/app/*` return a compact `result` envelope with packet metadata.
- Existing unprefixed write routes are preserved and return the raw engine action result.
- Local node identity is durable in SQLite and created on first read when missing.
- Local node identity is not login, wallet, reputation, or cryptographic identity.
- Correction and tombstone governance writes are ledger events only and return `local_apply_status: "stored_event_only"`.
- Correction and tombstone read routes are derived from packet history; they do not execute cleanup or deletion.
- Tombstone execution is disabled. The preview route always returns `execution_enabled: false`.
- `bestMeaning` selection is unchanged by the tombstone preview layer.
- Writable correction governance routes are in-process rate-limited.
- Sync routes exchange packets and cursors only; they do not introduce tombstone execution.

## Status Routes

### `GET /`

Returns local Mycelium node status.

```ts
{
  ok: true;
  name: "DAOVibe Mycelium Engine";
  version: "lmp/0.1";
  status: "running";
  node: {
    node_id: string;
    zone: string;
    author: string;
    node_age_group: string;
    db_path: string;
    port: number;
  };
}
```

### `GET /app/status`

Returns app-mode status, local node identity, local state counts, and sync capability flags.

```ts
{
  ok: true;
  app: {
    name: "DAOVibe";
    product_layer: "Mycelium";
    mode: {
      local_first: true;
      offline_capable: true;
      online_sync_capable: true;
      p2p_future_capable: true;
    };
  };
  node: {
    node_id: string;
    zone: string;
    author: string;
    node_age_group: string;
    db_path: string;
    port: number;
  };
  local_state: {
    packet_count: number;
    knowledge_count: number;
    known_node_count: number;
  };
  sync: {
    event_log_sync: true;
    change_only_packets: true;
    cursor_sync_available: true;
    inventory_sync_available: true;
  };
}
```

### `GET /node/status`

Returns local Mycelium node readiness, durable identity, packet ledger count, storage engine, and app capability flags. This route does not create packets, run sync, or contact peers.

```ts
{
  ok: true;
  node: {
    node_id: string;
    display_name: string;
    default_author: string;
  };
  service: {
    name: "Mycelium";
    layer: "DAOVibe Mycelium";
    status: "ready";
    uptime_seconds: number;
    server_time: number;
  };
  ledger: {
    packet_count: number;
  };
  storage: {
    durable: true;
    engine: "sqlite";
  };
  capabilities: {
    phrase_lookup: true;
    meaning_proposals: true;
    meaning_votes: true;
    corrections: true;
    correction_maturity: true;
    tombstone_packets: true;
    tombstone_execution: false;
    sync: true;
  };
}
```

## Local Node Identity Routes

Local node identity is a single durable identity record for the current Mycelium node. It gives the app stable local defaults before packet creation. It does not change packet protocol, packet signing, correction governance, or sync behavior.

Identity fields:

```ts
{
  node_id: string;
  display_name: string;
  default_author: string;
  created_at: number;
  updated_at: number;
}
```

`node_id` is generated once, stored durably, and reused after restart. It cannot be changed through the API. `display_name` and `default_author` are editable.

### `GET /node/identity`

Creates the local node identity if it does not exist, then returns it.

```ts
{
  ok: true;
  identity: {
    node_id: string;
    display_name: string;
    default_author: string;
    created_at: number;
    updated_at: number;
  };
}
```

### `POST /node/identity`

Updates editable local identity fields. At least one editable field is required. `node_id` is rejected if provided.

Body:

```ts
{
  display_name?: string; // non-empty after trim, max 120
  default_author?: string; // non-empty after trim, max 160
}
```

Response:

```ts
{
  ok: true;
  identity: {
    node_id: string;
    display_name: string;
    default_author: string;
    created_at: number;
    updated_at: number;
  };
}
```

Validation failure:

```ts
{
  ok: false;
  error: string;
}
```

## Phrase And Meaning Routes

### `GET /phrases/search?q={query}&limit={limit}`

Searches local phrase knowledge. Empty search text returns an empty result set. `limit` is clamped by Mycelium search rules.

```ts
{
  ok: true;
  query: string;
  count: number;
  results: Array<{
    phrase_id: string;
    surface_text?: string;
    phonetic_hint?: string;
    language_hint?: string;
    safety_label: string;
    meaning_count: number;
  }>;
}
```

### `GET /phrases/:phraseId`

Returns one local phrase record. Missing phrases return HTTP 404.

```ts
{
  ok: true;
  phrase: {
    phrase_id: string;
    surface_text?: string;
    phonetic_hint?: string;
    language_hint?: string;
    safety_label: string;
    meanings: Array<{
      meaning_id: string;
      reference_meaning: string;
      context?: string;
      confidence: number;
      confirms: number;
      rejects: number;
    }>;
  };
}
```

404 shape:

```ts
{
  ok: false;
  error: "Phrase not found.";
  phrase_id: string;
}
```

### `GET /phrases/:phraseId/bestMeaning`

Returns the current best meaning for a phrase. Missing phrases return HTTP 404. If a correction outranks the current meaning, `best_meaning.source` can be `"correction"` and include correction metadata. Tombstone previews do not suppress or alter this result.

```ts
{
  ok: true;
  phrase_id: string;
  has_best_meaning: boolean;
  best_meaning: null | {
    meaning_id: string;
    reference_meaning: string;
    context?: string;
    confidence: number;
    confirms: number;
    rejects: number;
    score: number;
    total_votes: number;
    source?: "correction";
    correction_id?: string;
    original_meaning_id?: string;
    confirm_votes?: number;
    reject_votes?: number;
    correction_score?: number;
  };
  reason?: string;
}
```

### `POST /app/lookupPhrase`

Body:

```ts
{
  query: string;
}
```

Response:

```ts
{
  ok: true;
  query: string;
  match_count: number;
  matches: Array<{
    phrase_id: string;
    surface_text?: string;
    phonetic_hint?: string;
    language_hint?: string;
    safety_label: string;
    meanings: Array<{
      meaning_id: string;
      reference_meaning: string;
      context?: string;
      confidence: number;
      confirms: number;
      rejects: number;
    }>;
  }>;
}
```

### `POST /app/observePhrase`

Body:

```ts
{
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  input_type?: "speech" | "text" | "symbol" | "drawing";
}
```

Response:

```ts
{
  ok: true;
  result: {
    phrase_id: string;
    packet_id: string;
    packet_type: "phrase_observed";
    created_at: number;
    local_apply_status: "applied_to_knowledge";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### `POST /app/proposeMeaning`

Body:

```ts
{
  phrase_id: string;
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  result: {
    phrase_id: string;
    meaning_id: string;
    packet_id: string;
    packet_type: "meaning_proposal";
    created_at: number;
    local_apply_status: "applied_to_knowledge";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### `POST /app/voteMeaning`

Body:

```ts
{
  phrase_id: string;
  meaning_id: string;
  vote: "confirm" | "reject" | "unsure";
  confidence: number;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  result: {
    phrase_id: string;
    meaning_id: string;
    vote: "confirm" | "reject" | "unsure";
    packet_id: string;
    packet_type: "meaning_vote";
    created_at: number;
    local_apply_status: "applied_to_knowledge";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### `POST /app/applySafetyLabel`

Body:

```ts
{
  phrase_id: string;
  label:
    | "normal"
    | "mild_slang"
    | "vulgar"
    | "adult_18_plus"
    | "abusive"
    | "dangerous"
    | "blocked";
  reason?: string;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  result: {
    phrase_id: string;
    label: string;
    packet_id: string;
    packet_type: "safety_label";
    created_at: number;
    local_apply_status: "applied_to_knowledge";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### Legacy Unprefixed Write Routes

These routes remain available and keep their existing paths:

- `POST /observePhrase`
- `POST /proposeMeaning`
- `POST /voteMeaning`
- `POST /applySafetyLabel`

They return:

```ts
{
  ok: true;
  result: EngineActionResult;
}
```

`EngineActionResult` includes `packet`, `packetSize`, `packetRoute`, and `nodeRoute`.

## Correction Governance Routes

Correction statuses are:

```ts
type CorrectionStatus =
  | "pending"
  | "maturing"
  | "confirmed"
  | "rejected"
  | "contested";
```

Maturity threshold:

```ts
MIN_CORRECTION_MATURITY_SCORE = 3;
```

Status rules:

- `pending`: `confirm_votes === 0 && reject_votes === 0`
- `confirmed`: `correction_score >= 3`
- `rejected`: `correction_score <= -3`
- `contested`: `confirm_votes > 0 && reject_votes > 0 && correction_score === 0`
- `maturing`: any non-zero vote state that does not meet the rules above

Identified duplicate voters are counted once per phrase and correction. Anonymous votes are counted individually. Conflict ranking is preserved: corrections are ordered by score descending, confirms descending, rejects ascending, correction id ascending, then proposal packet id ascending.

### `GET /phrases/:phraseId/corrections`

```ts
{
  ok: true;
  phrase_id: string;
  corrections: Array<{
    phrase_id: string;
    original_meaning_id: string;
    correction_id: string;
    corrected_reference_meaning: string;
    correction_context?: string;
    source?: string;
    confirm_votes: number;
    reject_votes: number;
    correction_score: number;
    status: CorrectionStatus;
    conflict_group_id: string;
    conflict_rank: number;
    is_conflicting: boolean;
  }>;
}
```

### `GET /phrases/:phraseId/correctionHistory?limit={limit}`

Returns phrase-scoped correction proposal and vote events from packet history. The `limit` is clamped by Mycelium history rules.

```ts
{
  ok: true;
  phrase_id: string;
  limit: number;
  history: Array<
    | {
        event_type: "correction_proposed";
        phrase_id: string;
        original_meaning_id: string;
        correction_id: string;
        corrected_reference_meaning: string;
        correction_context?: string;
        source?: string;
        packet_id?: string;
        created_at?: string | number;
      }
    | {
        event_type: "correction_vote";
        phrase_id: string;
        correction_id: string;
        vote: "confirm" | "reject";
        voter?: string;
        packet_id?: string;
        created_at?: string | number;
      }
  >;
}
```

### `GET /phrases/:phraseId/correctionCleanupCandidates`

Cleanup candidates are previews only. No cleanup or tombstone execution happens from this route.

Candidate reasons are:

- `rejected_status`
- `negative_score`
- `losing_conflict_candidate`

Candidate rules:

- `status === "rejected"`
- `correction_score <= -3`
- `is_conflicting === true && conflict_rank > 1 && correction_score <= -3`

A weak negative correction, such as one reject vote, is not a cleanup candidate.

```ts
{
  ok: true;
  phrase_id: string;
  candidates: Array<CorrectionSummary & {
    cleanup_reasons: Array<
      "rejected_status" | "negative_score" | "losing_conflict_candidate"
    >;
  }>;
}
```

### `POST /proposeMeaningCorrection`

Rate-limited.

Body:

```ts
{
  phrase_id: string;
  original_meaning_id: string;
  correction_id: string;
  corrected_reference_meaning: string;
  correction_context?: string;
  source?: string;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  accepted: true;
  result: {
    phrase_id: string;
    original_meaning_id: string;
    correction_id: string;
    packet_id: string;
    packet_type: "meaning_correction_proposed";
    created_at: number;
    local_apply_status: "stored_event_only";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### `POST /voteMeaningCorrection`

Rate-limited.

Body:

```ts
{
  phrase_id: string;
  correction_id: string;
  vote: "confirm" | "reject";
  voter?: string;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  accepted: true;
  result: {
    phrase_id: string;
    correction_id: string;
    vote: "confirm" | "reject";
    packet_id: string;
    packet_type: "meaning_correction_vote";
    created_at: number;
    local_apply_status: "stored_event_only";
    packet_size_class: string;
    route_decision: string;
  };
}
```

Correction governance write validation failures use:

```ts
{
  ok: false;
  accepted: false;
  rejected: true;
  error: string;
}
```

Rate-limit failures return HTTP 429 with the same shape and the error `Too many correction requests. Try again later.`

## Tombstone Governance Routes

Tombstone statuses are:

```ts
type TombstoneStatus =
  | "pending"
  | "maturing"
  | "confirmed"
  | "rejected"
  | "contested";
```

Tombstone maturity threshold:

```ts
MIN_TOMBSTONE_MATURITY_SCORE = 3;
```

Tombstone writes are stored as governance events only. They do not delete corrections, suppress corrections, or change best-meaning selection.

### `GET /phrases/:phraseId/tombstones`

```ts
{
  ok: true;
  phrase_id: string;
  tombstones: Array<{
    phrase_id: string;
    correction_id: string;
    tombstone_id: string;
    reason:
      | "rejected_status"
      | "negative_score"
      | "losing_conflict_candidate"
      | "spam"
      | "malformed"
      | "other";
    details?: string;
    proposer?: string;
    proposal_packet_id: string;
    proposed_at: number;
    confirm_votes: number;
    reject_votes: number;
    tombstone_score: number;
    status: TombstoneStatus;
  }>;
}
```

### `GET /phrases/:phraseId/tombstoneExecutionPreview`

This is a preview-only route. It lists corrections that would be suppressed if tombstone execution were enabled. Execution is disabled in this build.

```ts
{
  ok: true;
  phrase_id: string;
  execution_enabled: false;
  suppressed_count: number;
  active_count: number;
  suppressed_corrections: Array<{
    phrase_id: string;
    correction_id: string;
    correction_status: string;
    correction_score: number;
    tombstone_id: string;
    tombstone_reason: string;
    tombstone_score: number;
    tombstone_status: "confirmed";
  }>;
  active_corrections: Array<{
    phrase_id: string;
    correction_id: string;
    correction_status: string;
    correction_score: number;
  }>;
}
```

A tombstone appears in `suppressed_corrections` only when it is confirmed and has `tombstone_score >= 3`.

### `POST /proposeMeaningCorrectionTombstone`

Rate-limited.

Body:

```ts
{
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  reason:
    | "rejected_status"
    | "negative_score"
    | "losing_conflict_candidate"
    | "spam"
    | "malformed"
    | "other";
  details?: string;
  proposer?: string;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  accepted: true;
  result: {
    phrase_id: string;
    correction_id: string;
    tombstone_id: string;
    reason: string;
    packet_id: string;
    packet_type: "meaning_correction_tombstone_proposed";
    created_at: number;
    local_apply_status: "stored_event_only";
    packet_size_class: string;
    route_decision: string;
  };
}
```

### `POST /voteMeaningCorrectionTombstone`

Rate-limited.

Body:

```ts
{
  phrase_id: string;
  correction_id: string;
  tombstone_id: string;
  vote: "confirm" | "reject";
  voter?: string;
  parent?: string;
}
```

Response:

```ts
{
  ok: true;
  accepted: true;
  result: {
    phrase_id: string;
    correction_id: string;
    tombstone_id: string;
    vote: "confirm" | "reject";
    packet_id: string;
    packet_type: "meaning_correction_tombstone_vote";
    created_at: number;
    local_apply_status: "stored_event_only";
    packet_size_class: string;
    route_decision: string;
  };
}
```

## Local Debug Routes

These local routes expose node state and packet state for inspection:

- `GET /listKnowledge`
- `GET /nodes`
- `GET /packetCount`
- `GET /packetSummaries?limit={limit}`
- `GET /packetsAfter?receivedAfter={receivedAfter}&limit={limit}`
- `POST /receivePacket`

They are preserved for local Mycelium operation. `POST /receivePacket` stores valid incoming correction and tombstone packets as event-only packets and does not execute tombstones.

## Sync Routes

Sync routes are node-to-node packet exchange routes. They are not UI workflow routes.

- `GET /sync/status`
- `GET /sync/pull?cursor={cursor}&limit={limit}`
- `POST /packetsByIds`
- `GET /sync/cursor/:peerAuthor`
- `POST /sync/cursor/:peerAuthor`
- `POST /sync/missingPacketIds`
- `POST /sync/importBatch`
- `POST /sync/run`

### `GET /sync/status`

Returns locally stored sync cursor state only. This route does not run sync, pull packets, import packets, or contact peers.

```ts
{
  ok: true;
  sync: {
    enabled: true;
    mode: "manual";
    known_peer_count: number;
    peers: Array<{
      peer_author: string;
      cursor: string;
      updated_at: number;
    }>;
  };
}
```

Sync responses use the same top-level `ok` convention. Batch import and pull routes exchange packet data and cursor metadata. Sync preserves packet validation and event-only behavior for correction and tombstone governance packets.
