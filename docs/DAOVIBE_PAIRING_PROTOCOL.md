# DAOVibe Phone-Computer Pairing Protocol

Status: foundation only, transport-neutral, development authentication

## Purpose

This protocol establishes a local relationship between two separate DAOVibe
nodes:

- a phone node
- a computer node

Pairing records who approved the relationship. It does not synchronize packet
ledgers, merge state, discover peers, or authorize compute work.

Each device keeps its own immutable Node ID. Pairing never replaces or merges
Node IDs.

## Version

The current protocol version is:

```text
daovibe-pairing-v1
```

The message encoding is canonical JSON using the same sorted-key JSON rules
used by the Android protocol helpers. Pairing messages are application
messages, not Mycelium ledger packets, and must not be authored into the
packet ledger.

## Pairing Offer

The phone creates an offer representation:

```json
{
  "protocol_version": "daovibe-pairing-v1",
  "pairing_id": "pairing_<stable identifier>",
  "source_node_id": "mycelium_node_phone",
  "source_display_name": "Pocket Node",
  "source_platform": "android",
  "source_role": "phone",
  "created_at": 1700000000,
  "challenge": "development-correlation-value"
}
```

`pairing_id` is derived deterministically from the protocol version, source
Node ID, creation timestamp, and challenge value. The challenge is a
development-only correlation value. It is not a signature, secret, proof of
possession, authentication token, or encryption key.

The current Android UI only creates and displays this JSON locally. No
transport is started.

## Pairing Approval

After a future computer UI receives an offer and obtains local user approval,
it returns:

```json
{
  "protocol_version": "daovibe-pairing-v1",
  "pairing_id": "pairing_<same identifier>",
  "approving_node_id": "mycelium_node_computer",
  "approving_display_name": "Desk Node",
  "approving_platform": "desktop",
  "approving_role": "computer",
  "target_node_id": "mycelium_node_phone",
  "approved_at": 1700000001,
  "approval_state": "approved",
  "challenge_echo": "development-correlation-value"
}
```

The `approval_state` may be `approved` or `rejected`. A rejected approval is
not an active paired relationship. When an offer contains `challenge`, an
approval must contain an exact `challenge_echo`; an offer without a challenge
does not require an echo. This is development correlation only and does not
add cryptographic security, proof of possession, or authentication.

## Local Pairing Record

The phone stores relationship metadata locally:

```text
pairing_id
local_node_id
remote_node_id
remote_display_name
remote_platform
remote_role
status
created_at
paired_at
```

The Android storage table is `paired_devices`. Approved records are shown in
the Device screen. Rejected records may be retained for local history but are
not active.

The same `pairing_id` can be safely applied more than once. A repeated approval
does not create a second row. A different pairing ID for an already-approved
remote Node ID is rejected rather than creating a second active relationship.

## Validation Rules

Implementations must:

- keep the local Node ID unchanged
- reject an approval where the remote Node ID equals the local Node ID
- require the offer and approval to use the same protocol version
- require the approval to target the offer source Node ID
- require the approval pairing ID to match the offer
- preserve remote Node ID, display name, platform, and role as relationship metadata
- keep rejected relationships inactive
- avoid rewriting packet authors
- avoid importing or merging packet ledgers as a side effect
- keep pairing approval separate from packet synchronization

The current Android implementation validates structure and correlation only.
It does not claim that the approving node is cryptographically authenticated.

## Future Desktop Contract

A future desktop node should:

1. Parse and validate `PAIRING_OFFER`.
2. Display the source Node ID and device name to the local user.
3. Keep its own immutable desktop Node ID.
4. Ask the local user to approve or reject the relationship.
5. Return `PAIRING_APPROVAL` with the desktop Node ID and desktop metadata.
6. Store its own mirrored local relationship record with the phone as the
   remote node.
7. Treat repeated approvals as idempotent.
8. Keep approval storage separate from packet synchronization.

The desktop role is `computer`; the desktop platform may use `desktop`,
`windows`, `macos`, `linux`, or another agreed platform value. The role and
platform values are descriptive metadata, not authorization claims.

Later transport implementations may carry these JSON messages over local
files, a QR payload, USB, Bluetooth, LAN, or internet connections. Transport
choice is intentionally outside this protocol.

## Explicit Non-Goals

This foundation does not implement:

- cryptographic signatures
- public-key exchange
- proof of possession
- encryption
- peer discovery
- DHT or gossip
- NAT traversal or relay
- packet or ledger synchronization
- compute permissions
- WASM execution
- job scheduling
- cloud accounts

Those concerns require separate designs and must not be inferred from an
approved local pairing record.
