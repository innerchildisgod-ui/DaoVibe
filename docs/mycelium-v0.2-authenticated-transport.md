# Mycelium v0.2 authenticated encrypted transport

Status: design only; this document does not change `daovibe-connection-v1`,
framing, or sync behavior.

## Recommended construction

Use Noise `XX` with a standard 25519/ChaChaPoly/SHA-256 suite (the exact
platform library remains an implementation-time compatibility decision). XX is
appropriate because an initial connection does not require the initiator to
already know the responder's static transport key. Both sides contribute
ephemeral keys, then authenticate long-term Mycelium identity keys in encrypted
payloads. The long-term identity key is Ed25519 for packet and transcript
signatures; Noise static/ephemeral DH keys are separate and never reused as
signing keys.

Noise payloads carry canonical, length-bounded fields: protocol version set,
selected connection and packet versions, source/target node IDs, identity key
scheme and public key, key fingerprint, pairing/invite correlation (if any), and
an Ed25519 signature over a domain-separated transcript hash. The signature
binds both identity keys, both node IDs, the complete Noise handshake hash, and
the negotiated versions/capabilities. A side verifies the public key's
fingerprint and pinned trust state before accepting the session.

The transcript signature input is the UTF-8 bytes
`daovibe/mycelium/transport-auth/v2\0` followed by the canonical payload bytes;
the NUL separator and domain string are part of the signed bytes.

Noise IK was rejected for the initial deployment because it requires a known
responder static key before the first handshake; it can be a future optimized
pattern after pinning. A custom signed ephemeral-DH exchange was rejected as
harder to audit, easier to get transcript/downgrade/nonce handling wrong, and
duplicative of Noise's reviewed state machine.

The repository currently has Android minSdk 26, Java/Kotlin 17, Room 2.8.4 and
no cryptographic dependency; Rust targets 1.90 and currently depends on
`sha2`, `uuid`, `rusqlite`, and serialization only. Therefore provider/crate
selection, API availability on API 26, and a vetted Noise implementation are
explicit implementation-spike questions, not assumptions of this design.

## Version and handshake sequence

The new authenticated protocol identifier is `daovibe-connection-v2`. Existing
`daovibe-connection-v1` remains a legacy development path only. The v2 sequence
is:

1. bounded preface advertises supported connection/packet versions and a fresh
   session nonce;
2. Noise XX messages 1-3 exchange ephemeral/static DH material;
3. each encrypted identity payload verifies node ID, Ed25519 public key,
   fingerprint, transcript signature, and the pinned trust state;
4. both sides authenticate the negotiated versions and capabilities in the
   transcript and derive directional transport keys;
5. an authenticated `CONNECTION_CONFIRM` (or equivalent Noise payload) is
   exchanged; only then may normal sync messages run.

The old 4-byte big-endian length prefix remains the outer bounded framing. A v2
frame payload is binary/encoded ciphertext, not canonical JSON; the maximum
frame remains 64 KiB unless a separately versioned limit is negotiated. No
packet ledger entry represents handshake messages.

## Keys, frames, and lifecycle

Noise derives independent `send` and `receive` AEAD keys using its transcript
KDF. Each encrypted frame contains a version byte, direction-local monotonically
increasing 64-bit counter, ciphertext length, and ciphertext/tag. The AEAD
nonce is deterministically formed from the direction key and counter; counters
start at zero, never repeat for a key, and overflow closes the session. Header
fields are authenticated as associated data. A receiver rejects a duplicate,
regressed, or impossible counter before decryption and closes on authentication
failure.

Sessions are short-lived foreground connections. Rekey occurs on a bounded
frame/byte/time limit through the Noise rekey mechanism or a fresh handshake;
the exact limit is a testable constant. Clean close sends an authenticated close
reason, flushes, and then closes the socket. Timeouts, malformed frames,
decrypt failures, and unexpected EOF are fail-closed and do not update sync
state.

## Replay and downgrade policy

Packet replay is harmless to the ledger because packet IDs are primary keys and
imports are idempotent, but a transport replay cannot advance a cursor: session
IDs, transcript hashes, counters, and request/response direction are checked.
Persisted cursor state remains outside semantic fingerprints. A packet with a
valid signature but an already stored packet ID is a duplicate, not a new event.

The selected version, complete advertised version sets, packet protocol,
capabilities, node IDs, and fingerprints are transcript-bound. A pinned v2 peer
rejects a v1-only offer (`protocol_downgrade`); there is no silent fallback after
pinning. A legacy-unverified peer may use v1 only when the local user explicitly
enables migration, and such a session cannot silently become trusted.

## Rejects and Diagnose

Bounded reject categories include `identity_key_missing`,
`peer_key_unpinned`, `peer_key_changed`, `handshake_auth_failed`,
`handshake_transcript_invalid`, `protocol_downgrade`,
`unsupported_crypto_suite`, `replay_detected`, `decrypt_failed`, and
`nonce_or_counter_invalid`, in addition to existing structural categories.

Future authenticated Diagnose runs AKE, verifies the pinned identity and
negotiated transcript, records only bounded peer diagnostic metadata, sends a
clean close, and performs no ledger/cursor/state mutation. A successful Diagnose
therefore proves cryptographic peer/session compatibility, not semantic trust in
the peer's future packets or real-world identity.
