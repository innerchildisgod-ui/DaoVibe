# Mycelium v0.2 cross-language crypto test-vector plan

This is a fixture plan only. No production private keys or generated secrets are
added by this milestone.

## Deterministic vectors

Android and Rust must consume the same JSON/hex fixture records for:

1. raw Ed25519 public-key bytes, unpadded base64url encoding, scheme name, and
   lowercase SHA-256 fingerprint;
2. the exact packet-signature preimage bytes: UTF-8
   `daovibe/mycelium/packet-signature/v2\0` followed by canonical JSON of
   an object containing `signature_version`, `signature_scheme`,
   `key_fingerprint`, and a `packet_input` object with `version`, `packet_id`,
   `packet_type`, `created_at`, optional `expires_at`, `zone`, `author`,
   optional `parent`, and `payload_hash` (never the signature);
3. one valid v0.2 signature and one bit-flipped/author-changed invalid signature;
4. node_id/public-key binding and key-fingerprint mismatch;
5. canonical Noise identity payload and transcript hash for a fixed handshake
   fixture, including selected connection/packet versions and capabilities;
6. version negotiation success, missing common version, and downgrade attempt;
7. an authorized old-key-to-new-key rotation record and invalid unauthorized
   replacement;
8. canonical v1 invite bytes/ID regression (353 bytes and the existing ID).

Fixtures should encode bytes as lowercase hex or base64url and include a
`vector_version` plus algorithm/suite identifiers. The signing seed used to
produce a test vector is kept in the test harness or generated at test runtime,
never in a production resource or release artifact.

## Randomized/integration tests

Use fresh ephemeral Noise keys and random nonces for Android↔Rust loopback tests
that assert mutual authentication, encrypted-frame round trips, counter
regression/duplicate rejection, clean close, rekey, timeout, and packet import
only after authentication. Run three-node authenticated sync with restart and
persisted pins. These tests assert semantic fingerprints remain the four v0.1
values and that v1 invite fixtures remain byte-for-byte compatible.

Failure vectors must cover malformed key encodings, unsupported suites,
transcript changes, wrong node IDs, changed pins, expired/legacy policy,
replayed frames, nonce overflow, truncated ciphertext, and invalid packet
signatures. Android and Rust test names should reference the same vector IDs so
divergence is diagnosable.
