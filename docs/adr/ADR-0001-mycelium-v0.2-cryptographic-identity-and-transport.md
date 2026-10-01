# ADR-0001: Mycelium v0.2 cryptographic identity and transport

Status: accepted design direction; implementation and library selection remain
gated on platform spikes.

## Context

v0.1 has immutable random node IDs, a packet ledger, deterministic reducers,
development-only `dev_signature` strings, development pairing IDs/invites, and
canonical JSON over unencrypted length-prefixed TCP. Historical packet IDs and
authors must never change. Android is minSdk 26 with no crypto dependency;
Rust is 1.90 with only hashing/serialization crypto today.

## Decision

Use an Ed25519 long-term signing identity independent of the immutable node ID.
Encode raw 32-byte public keys as unpadded base64url; identify them by lowercase
SHA-256 hex fingerprints. Store a node_id→public-key binding and explicit trust
state. A same-node unexpected key is `key_changed`, never auto-trusted.

Use Noise XX with a standard 25519/ChaChaPoly/SHA-256 suite for v2 transport,
with Ed25519 identity signatures over the complete transcript and negotiated
versions. Use per-direction AEAD keys, monotonic counters, bounded frames,
rekey, clean close, and fail-closed replay/decrypt handling. Authenticate before
any sync import or cursor mutation.

Keep v1 packet IDs and JSON untouched. Since the current packet ID preimage
already excludes `signature`, v0.2 may carry an explicit versioned Ed25519
signature envelope (`ed25519:v2:<fingerprint>:<unpadded-base64url-signature>`) in
that existing field; the signed preimage is the UTF-8 domain tag
`daovibe/mycelium/packet-signature/v2\0` followed by canonical JSON of the
signature version, scheme, key fingerprint, and existing signature-input fields.
A packet-protocol bump is required only
if implementation constraints make that envelope unsafe; it must then be an
additive version with dual historical parsing.

Evolve invites to v2 with public key/fingerprint and expiry/capabilities, while
keeping v1 parseable as `legacy_unverified`. Invite signatures prove key control,
not real-world identity; out-of-band fingerprint approval remains required.

Use Android Keystore where supported, hardware-backed when available, with a
vetted encrypted fallback for API-26 gaps. On Windows prefer OS-protected key
wrapping with an encrypted-file/passphrase alternative. Never treat ACLs as
hardware security.

## Alternatives rejected

Noise IK is deferred because first contact does not yet know a responder key.
Custom signed ephemeral-DH is rejected for audit and downgrade/nonce risk.
Deriving node IDs from public keys is rejected because existing IDs are
immutable interoperability values. Silent TOFU and silent v1 fallback are
rejected because they hide key changes and downgrade attacks.

## Consequences and unresolved risks

The design adds key lifecycle UX, trust decisions, provider/crate compatibility
work, and additive schema migrations. It does not hide metadata, prevent DoS,
repair a compromised unlocked device, or create Byzantine consensus. Exact
Android Keystore Ed25519 support at minSdk 26, the audited cross-platform Noise
libraries, Windows protection API, and final binary frame encoding require the
v0.2A/C implementation spikes and must not be guessed in this design milestone.

## v0.2A resolution

The v0.2A spike selected audited Bouncy Castle Ed25519 plus Android Keystore
AES-GCM wrapping for API-26-compatible Android persistence. Windows uses
`ed25519-dalek` with user-scoped DPAPI wrapping. These choices affect only local
identity persistence and diagnostics; packet signatures and transport remain
the v0.1 development behaviors until later milestones.
