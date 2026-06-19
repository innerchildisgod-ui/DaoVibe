# DAOVibe Mycelium Engine - Project State

## Product Identity

DAOVibe is not a throwaway prototype or investor-demo MVP.

This repository is the actual product foundation for the DAOVibe ecosystem.

The current active layer is Mycelium, the DAOVibe language layer. Later layers may include local social voice, delivery, taxi, marketplace, and other community services.

The system should be built in testable layers, but those layers should be treated as permanent product infrastructure.

---

## Core Vision

DAOVibe is a people-owned, local-first infrastructure system.

The goal is to let people communicate, validate local knowledge, and build services using the devices they already have:

- phones
- laptops
- desktops
- shop computers
- community nodes

The long-term direction is a local mesh-style ecosystem where community devices help store, validate, and relay useful local knowledge and service events.

---

## Current Active Layer: Mycelium

Mycelium is a meaning-based language engine.

The rule is:

> Translate meaning to meaning, not word to word.

The intended flow:

1. Person speaks or types.
2. Speech/text is converted into structured input.
3. Meaning is extracted.
4. Local/community knowledge is checked.
5. Correct target-language structure is generated.
6. Voice/text output is produced.

The system should support:

- local slang
- dialects
- underrepresented languages
- spoken phrases
- written symbols
- drawn symbols
- community corrections
- confidence scoring
- safety filtering

---

## Current Architecture Rule

Resident knowledge stays local.

Only small signed change packets move.

This means:

- full knowledge records stay in the node database
- packets represent events/changes
- nodes should not constantly transmit unchanged data
- sync should send only missing events

Core rule:

> Do not transmit what is already true. Transmit only what changed.

---

## Controller / Conductor Architecture

DAOVibe Mycelium uses small focused modules coordinated by local controller files.

- Routes expose HTTP.
- Controllers decide what happens next.
- Stores persist state.
- Filters reject bad sync.
- Promoters advance useful sync.
- Kernel-boundary files isolate deterministic decision logic so hot paths can later move into chip-close/native implementations without changing the API layer.

The first active controllers are:

- MyceliumController
- SyncController

The first active kernel boundary is:

- NativeKernelBoundary
- TypeScriptKernel

This is product architecture, not a throwaway prototype.

Sync import now returns detailed packet movement summaries:

- accepted_new
- already_stored
- rejected_invalid
- rejected_expired
- failed_apply

---

## Current Build Flow

- Current active layer: Mycelium language layer.
- `npm run dev` starts the real persistent local node API server from `src/server.ts`.
- `npm run demo` runs the old manual demo script from `src/index.ts`.
- We are not demo-first. We use real local node/server steps.
- The next proof is two-node language sync:
  - Node A runs on port 3000 with its own SQLite DB.
  - Node B runs on port 3001 with its own SQLite DB.
  - A phrase is created on Node A.
  - Node B syncs from Node A using `/sync/run`.
  - Node B must then show the phrase in `/listKnowledge`.
  - Running sync again should import 0 new packets or mark packets as already stored.
- Sync import now returns detailed packet movement summaries:
  - accepted_new
  - already_stored
  - rejected_invalid
  - rejected_expired
  - failed_apply
- This supports the Mycelium controller idea: local nodes filter bad sync, promote useful sync, and explain packet movement clearly.

The current Express server is not a central backend. It is a local node API/daemon. In the final architecture, phones, PCs, laptops, and business machines act as heterogeneous local nodes in the packet swarm.

---

## Transmission Modes

Default mode:

- change-only event packets

Live-action exception:

- temporary live-session updates

Live-session updates are allowed only when the action requires them, such as:

- food delivery driver location
- taxi driver/passenger location
- emergency routing
- active navigation

After the live session ends, continuous updates must stop.

Old live packets should expire quickly.

Permanent language knowledge can live long.

Live location/status packets should expire fast.

---

## LMP: Language Mesh Protocol

Current protocol name:

LMP = Language Mesh Protocol

Current packet types:

- phrase_observed
- meaning_proposal
- meaning_vote
- correction
- safety_label
- symbol_sample

Current packet design:

- version
- packet_id
- packet_type
- created_at
- expires_at
- zone
- author
- parent
- payload_hash
- payload
- signature placeholder

Packet rules:

- stable hashing
- packet validation
- duplicate rejection
- expiry rejection
- packet indexing
- packet-size estimation
- route planning

---

## Current Folder Structure

```text
repo-root
+- src
|  +- config
|  |  +- env.ts
|  +- protocol
|  |  +- packet.ts
|  |  +- packetTypes.ts
|  |  +- hash.ts
|  |  +- validatePacket.ts
|  |  +- packetIndex.ts
|  |  +- packetRouter.ts
|  |  +- packetSize.ts
|  +- knowledge
|  |  +- phraseStore.ts
|  |  +- confidence.ts
|  +- safety
|  |  +- safetyLabels.ts
|  |  +- safetyGate.ts
|  +- network
|  |  +- nodeProfile.ts
|  |  +- nodeDirectory.ts
|  |  +- routePlanner.ts
|  +- kernel
|  |  +- KernelDecisionTypes.ts
|  |  +- NativeKernelBoundary.ts
|  |  +- TypeScriptKernel.ts
|  +- mycelium
|  |  +- MyceliumController.ts
|  +- storage
|  |  +- sqliteStore.ts
|  +- sync
|  |  +- SyncResultSummary.ts
|  |  +- SyncController.ts
|  +- server
|  |  +- createServer.ts
|  |  +- startServer.ts
|  |  +- http
|  |  |  +- requestJson.ts
|  |  +- routes
|  |     +- languageRoutes.ts
|  |     +- syncRoutes.ts
|  +- engine.ts
|  +- index.ts
|  +- server.ts
+- data
|  +- local_node.db
+- package.json
+- tsconfig.json
+- PROJECT_STATE.md
```

---

## Built So Far

The engine currently has:

- LMP packet creation
- stable SHA-256 packet hashing
- packet validation
- packet duplicate detection
- packet indexing
- packet routing
- packet size estimation
- phrase observation
- meaning proposal
- meaning voting
- confidence updating
- safety labels
- safety gate foundation
- node profiles
- node directory
- route planner
- HTTP bridge using Express
- SQLite persistence foundation
- packet summary / packet log sync foundation
- inbound packet receiving foundation

---

## Important Product Rules

### 1. No meaningless prototypes

Every layer should be useful as future product infrastructure.

Testing is allowed and required, but it should test real architecture.

### 2. Engine first, UI later

The cute mushroom UI is part of the product direction, but the engine must be reliable first.

### 3. Local state plus event log

The node should store both:

- current state
- event history

Current state is for fast app lookup.

Event history is for syncing missing changes between nodes.

### 4. Change-only sync

Nodes should compare packet IDs and exchange only missing packets.

They should not repeatedly transmit full state.

### 5. Live updates only when needed

Delivery and taxi may require temporary live location updates.

Those updates should be session-based and expire quickly.

### 6. Safety is not optional

Unknown or unsafe content must be filtered before being sent to community nodes.

Children must not receive adult or unsafe content.

---

## Current Working Commands

Install dependencies:

```powershell
npm install
```

Run real persistent local node API server:

```powershell
npm run dev
```

Run Node A:

```powershell
$env:DAOVIBE_PORT="3000"
$env:DAOVIBE_AUTHOR="dev_public_key_laptop_001"
$env:DAOVIBE_NODE_ID="node_laptop_001"
$env:DAOVIBE_DB_PATH="data/node_a_test.db"
npm run dev
```

Run Node B:

```powershell
$env:DAOVIBE_PORT="3001"
$env:DAOVIBE_AUTHOR="dev_public_key_phone_adult_001"
$env:DAOVIBE_NODE_ID="node_phone_adult_001"
$env:DAOVIBE_DB_PATH="data/node_b_test.db"
npm run dev
```

Run old manual demo script:

```powershell
npm run demo
```

Run typecheck:

```powershell
npm run typecheck
```

Test server root:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/" -Method GET
```

Test packet summaries:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/packetSummaries" -Method GET
```

---

## Current HTTP Endpoints

```text
GET  /
POST /observePhrase
POST /proposeMeaning
POST /voteMeaning
POST /applySafetyLabel
POST /receivePacket
GET  /listKnowledge
GET  /nodes
GET  /packetCount
GET  /packetSummaries
GET  /packetsAfter
POST /packetsByIds
GET  /sync/pull
POST /sync/importBatch
POST /sync/run
GET  /sync/cursor/:peerAuthor
POST /sync/cursor/:peerAuthor
POST /sync/missingPacketIds
```

---

## Next Engineering Step

The next proof is two-node language sync using the real local node API server.

Why:

The current engine can create local packets and receive packets from another node.

But a mesh node must also prove that a second local server can pull, import, and apply another node's missing language packets.

The proof must:

1. run Node A on port 3000 with its own SQLite DB
2. run Node B on port 3001 with its own SQLite DB
3. create a phrase on Node A
4. sync Node B from Node A using `/sync/run`
5. confirm Node B shows the phrase in `/listKnowledge`
6. run sync again and confirm it imports 0 new packets or marks packets as already stored

---

## User Workflow Preference

When the user types:

```text
n
```

It means:

```text
next
```

Unless the user reports an error, assume the previous step worked.

For every build step, explain:

1. what to do
2. why we are doing it
3. what success proves
