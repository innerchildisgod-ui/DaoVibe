# DAOVibe Internet Peer Connection Protocol

Status: foundation plus explicit bounded sync, transport-neutral,
development peer correlation

## Purpose

This protocol lets two already-paired DAOVibe nodes establish a compatible
connection session over a future internet transport.

The handshake itself does not synchronize packet ledgers or import packets. A
separate `daovibe-sync-v1` application protocol may run only after a successful
handshake on the same temporary explicit connection. This milestone still does
not discover peers, run relay infrastructure, or provide cryptographic
authentication.

Pairing is a prerequisite. In the current Android foundation, paired means
locally approved and correlated, not cryptographically authenticated.

## Version

Current connection protocol version:

```text
daovibe-connection-v1
```

Connection messages are canonical JSON application messages. They are not
Mycelium ledger packets and must not be written into the packet ledger.

The current packet protocol version negotiated by this handshake is the
existing Mycelium packet version:

```text
lmp/0.1
```

## Messages

### CONNECTION_HELLO

```json
{
  "message_type": "connection_hello",
  "protocol_version": "daovibe-connection-v1",
  "session_id": "session_0123456789abcdef0123456789abcdef",
  "source_node_id": "mycelium_node_phone",
  "target_node_id": "mycelium_node_computer",
  "source_platform": "android",
  "source_role": "phone",
  "pairing_id": "pairing_...",
  "created_at": 1700000000,
  "supported_connection_versions": ["daovibe-connection-v1"],
  "supported_packet_protocol_versions": ["lmp/0.1"],
  "capabilities": [
    "ledger_export_import",
    "lightweight_node",
    "mycelium",
    "packet_ledger"
  ]
}
```

### CONNECTION_ACCEPT

```json
{
  "message_type": "connection_accept",
  "protocol_version": "daovibe-connection-v1",
  "session_id": "session_0123456789abcdef0123456789abcdef",
  "source_node_id": "mycelium_node_computer",
  "target_node_id": "mycelium_node_phone",
  "pairing_id": "pairing_...",
  "accepted_at": 1700000001,
  "negotiated_connection_version": "daovibe-connection-v1",
  "negotiated_packet_protocol_version": "lmp/0.1",
  "capabilities": ["mycelium", "packet_ledger"],
  "state": "connected"
}
```

`capabilities` on accept is the negotiated descriptive intersection of the
local supported set and the remote advertised set. It is not an authorization
grant.

### CONNECTION_REJECT

```json
{
  "message_type": "connection_reject",
  "protocol_version": "daovibe-connection-v1",
  "session_id": "session_0123456789abcdef0123456789abcdef",
  "source_node_id": "mycelium_node_computer",
  "target_node_id": "mycelium_node_phone",
  "pairing_id": "pairing_...",
  "rejected_at": 1700000001,
  "reason_code": "pairing_not_found"
}
```

## Session ID

A session ID identifies one connection attempt.

Requirements:

- generated per attempt
- distinct from Node IDs and pairing IDs
- safe to log locally
- contains no secrets
- not authentication

The current format is:

```text
session_<32 lowercase hex characters>
```

Tests pass fixed session IDs for deterministic behavior.

## Handshake Sequence

Phone:

```text
CONNECTION_HELLO
        |
        v
Computer validates:
- Node IDs
- pairing relationship
- protocol compatibility
- capabilities
        |
        v
CONNECTION_ACCEPT
        |
        v
Both sides: connected session state
```

Future desktop platforms may include Windows, macOS, and Linux. The protocol
does not depend on Android APIs.

## Validation

Implementations reject:

- missing Node IDs
- source Node ID equal to target Node ID
- unsupported connection protocol version
- target Node ID mismatch
- unknown pairing ID
- inactive or rejected pairing
- pairing whose remote Node ID does not match the peer
- malformed capabilities
- malformed session ID
- hello/accept session mismatch
- hello/accept Node ID direction mismatch
- incompatible connection protocol version set
- incompatible packet protocol version set

Handshake success requires an active local pairing relationship.

## Version Negotiation

Both sides advertise supported connection protocol versions and supported
packet protocol versions.

DAOVibe must choose only a mutually supported known version. Unknown versions
must not be silently accepted. If there is no compatible version, the node
rejects with a structured reason such as:

```text
incompatible_connection_version
incompatible_packet_version
```

## Capabilities

Capabilities are descriptive metadata only.

Initial phone capabilities:

- mycelium
- packet_ledger
- ledger_export_import
- lightweight_node

Potential future computer capabilities:

- mycelium
- packet_ledger
- persistent_storage
- heavy_compute
- cache
- verification
- relay

Connection capabilities are still parsing, validation, canonical encoding, and
negotiation metadata only. They do not implement compute, storage delegation,
relay, verification behavior, or authorization.

## Session State

Local session state may be represented as:

- idle
- connecting
- hello_sent
- hello_received
- negotiating
- connected
- rejected
- disconnected
- failed

This state is transient and must not be written into the packet ledger.

## Transport Boundary

The Android foundation defines a small `PeerTransport` abstraction:

```text
connect(endpoint)
send(canonicalMessageJson)
receive()
close()
```

The first concrete implementation is a direct TCP transport. It connects only
to an explicitly configured host and port. TCP reachability is not guaranteed:
phones and home computers are commonly behind NATs and firewalls. This
milestone does not implement NAT traversal, hole punching, STUN, TURN, relay,
peer discovery, DHT, gossip, Bluetooth, Wi-Fi Direct, hotspot mesh, cloud
accounts, or a DAOVibe central server.

The transport uses deterministic length-prefixed UTF-8 framing:

```text
[4-byte big-endian message length][canonical JSON UTF-8 bytes]
```

The maximum connection or sync application frame is 64 KiB. Zero, negative,
oversized, truncated, and invalid UTF-8 frames are rejected before unbounded
allocation. Sync batches also enforce their own canonical 64 KiB batch limit
and 50 packet maximum.

Default socket bounds are:

- connect timeout: 4 seconds
- read timeout: 8 seconds
- one user-initiated attempt at a time
- no automatic retry loop
- no permanent background socket

The handshake-only client method performs one handshake request/response and
closes the socket after the response. The explicit sync method may keep the
same temporary socket open after `CONNECTION_ACCEPT` for multiple bounded
`SYNC_REQUEST` / `SYNC_BATCH` exchanges, then closes it at the end of that
foreground sync run. A `connected` session means the connection protocol was
accepted and correlated; it does not represent a persistent live channel.

The listener foundation is transport-neutral at the boundary and has a TCP
implementation:

```text
start(port)
accept()
stop()
```

Future desktop behavior:

```text
Desktop listener
       |
       v
accept socket
       |
       v
read CONNECTION_HELLO
       |
       v
validate active pairing
       |
       v
negotiate versions/capabilities
       |
       v
send CONNECTION_ACCEPT / REJECT
       |
       v
optional explicit daovibe-sync-v1 windows
```

The desktop remains its own node. No Node ID merging occurs, and this
foundation performs no background, live, or permanent packet synchronization.
Bounded sync windows move packet-ledger entries only; they do not transmit
derived phrase, meaning, or vote tables.

## Security Boundary

Currently provided:

- structural validation
- Node ID correlation
- pairing relationship correlation
- protocol compatibility
- session correlation
- capability negotiation

Not yet provided:

- cryptographic peer authentication
- proof of possession
- end-to-end encryption
- signed handshake
- secure key exchange
- certificate validation
- Sybil resistance
- NAT traversal
- relay trust
- anonymous networking

The direct TCP development transport is not encrypted. It does not provide
confidentiality or integrity protection against an active network attacker.
Use wording such as paired peer correlation or development connection
handshake. Do not call this transport secure or authenticated until a later
dedicated authenticated-encryption milestone exists.
