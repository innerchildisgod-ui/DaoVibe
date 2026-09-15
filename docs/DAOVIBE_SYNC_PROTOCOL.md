# DAOVibe Bounded Delta Packet Synchronization

Status: explicit foreground sync, transport-neutral, development peer
correlation

## Purpose

`daovibe-sync-v1` lets an already-paired node pull missing packet-ledger deltas
after a successful `daovibe-connection-v1` handshake.

Resident state stays local. Sync messages are connection-level application
messages, not Mycelium ledger packets, and must never be inserted into the
packet ledger.

## Messages

`SYNC_REQUEST` contains:

- `protocol_version`
- `session_id`
- `source_node_id`
- `target_node_id`
- `pairing_id`
- `cursor`
- `limit`

`SYNC_BATCH` contains:

- `protocol_version`
- `session_id`
- `source_node_id`
- `target_node_id`
- `pairing_id`
- `request_cursor`
- `next_cursor`
- `has_more`
- `packets`

`SYNC_REJECT` contains:

- `protocol_version`
- `session_id`
- `source_node_id`
- `target_node_id`
- `pairing_id`
- `reason_code`

## Cursor

The cursor is an opaque responder-owned ledger position. The current Android
representation is:

```text
received_at:packet_id
```

The default cursor is:

```text
0:
```

Responders order export windows by:

```text
received_at ASC, packet_id ASC
```

Requesters store the latest successfully imported remote cursor per paired
remote node in Room `peer_sync_state`. Requesters must not derive a remote
cursor from local `received_at` values.

## Bounds

- maximum packets per sync batch: 50
- maximum canonical sync batch bytes: 64 KiB
- maximum windows per explicit sync run: 20
- no endless retry loop
- no automatic reconnect loop
- no permanent socket
- no background listener on Android

If a single packet cannot fit inside the batch byte limit, the responder
returns a structured rejection instead of looping.

## Import

Inbound batches are validated before writes. The importer checks the envelope,
session direction at the connection layer, Node ID direction, pairing ID, batch
count, batch byte size, packet validity, expiry, duplicate packet IDs, and the
stored local Device Identity target.

All genuinely new packets are inserted and derived Mycelium state is rebuilt in
one Room transaction. The peer sync cursor advances only after the batch and
derived replay succeed. On failure, packet inserts, derived rows, and cursor
updates roll back together.

## Source Of Truth

The packet ledger is the source of truth.

Peer snapshots, network transport, sync cursors, and derived Mycelium tables
are not source-of-truth state. Derived phrase, meaning, and vote state must be
reconstructable from accepted ledger packets.

## Security Boundary

Current protections are development-grade peer correlation:

- active pairing correlation
- Node ID correlation
- session correlation
- structural packet validation
- current hash and development signature behavior
- protocol limits

Not provided:

- cryptographic peer authentication
- authenticated encryption
- proof of possession
- secure key exchange
- network attacker protection

Do not describe this transport or sync protocol as secure or authenticated.
