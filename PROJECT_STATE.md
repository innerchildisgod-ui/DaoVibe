# CallSab Language Engine — Project State

## Product Identity

CallSab is not a throwaway prototype or investor-demo MVP.

This repository is the actual product foundation for the CallSab ecosystem.

The first product layer is the language engine. Later layers may include local social voice, delivery, taxi, marketplace, and other community services.

The system should be built in testable layers, but those layers should be treated as permanent product infrastructure.

---

## Core Vision

CallSab is a people-owned, local-first infrastructure system.

The goal is to let people communicate, validate local knowledge, and build services using the devices they already have:

- phones
- laptops
- desktops
- shop computers
- community nodes

The long-term direction is a local mesh-style ecosystem where community devices help store, validate, and relay useful local knowledge and service events.

---

## First Product Layer: Language

The first layer is a meaning-based language engine.

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
callsab_language_engine
├─ src
│  ├─ protocol
│  │  ├─ packet.ts
│  │  ├─ packetTypes.ts
│  │  ├─ hash.ts
│  │  ├─ validatePacket.ts
│  │  ├─ packetIndex.ts
│  │  ├─ packetRouter.ts
│  │  └─ packetSize.ts
│  ├─ knowledge
│  │  ├─ phraseStore.ts
│  │  └─ confidence.ts
│  ├─ safety
│  │  ├─ safetyLabels.ts
│  │  └─ safetyGate.ts
│  ├─ network
│  │  ├─ nodeProfile.ts
│  │  ├─ nodeDirectory.ts
│  │  └─ routePlanner.ts
│  ├─ storage
│  │  └─ sqliteStore.ts
│  ├─ engine.ts
│  ├─ index.ts
│  └─ server.ts
├─ data
│  └─ callsab_language_engine.db
├─ package.json
├─ tsconfig.json
└─ PROJECT_STATE.md
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

Run local engine test:

```powershell
npm run dev
```

Run HTTP server:

```powershell
npm run server
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
```

---

## Next Engineering Step

The next step is to test `POST /receivePacket`.

Why:

The current engine can create local packets.

But a mesh node must also accept packets from another node.

The receiver must:

1. accept a packet from outside
2. validate packet hash
3. reject duplicates
4. reject expired packets
5. route accepted packets into the local packet index
6. apply the packet payload to local knowledge state
7. save the packet to SQLite

After that, create a clean two-node simulation so one node can send a packet and another node can accept it as new.

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