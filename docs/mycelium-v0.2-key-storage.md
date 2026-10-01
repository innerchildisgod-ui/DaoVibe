# Mycelium v0.2 key storage, rotation, and recovery

Status: design only. Current Android Room v7 and Rust SQLite are unchanged.

## Android

The current app is minSdk 26, target/compile SDK 36, Java 17, and has no crypto
library. v0.2A should prefer an Android Keystore asymmetric key when the device
provider supports the selected Ed25519 operation, requesting hardware-backed
protection where available and recording whether the provider reports hardware
backing. Hardware backing is a preference, not a correctness requirement.

Because API-26 provider support must be proven on the supported device matrix,
the implementation must first run a provider capability spike. If direct
Keystore Ed25519 is unavailable, use a vetted audited provider or generate the
key in software and wrap it with a Keystore AES-GCM key; never invent a cipher
or silently store an unencrypted private key. The fallback and provider name
are diagnostic metadata only.

The database stores the public key, scheme, fingerprint, creation time, and
state; the private key handle/material is kept in Keystore or an encrypted
file only as required by the selected provider. Private material is not
exported by default. Uninstall/reinstall and backup restore are treated as key
loss unless the OS backup policy demonstrably preserves the same protected key.
The UI exposes the node ID, scheme, full fingerprint grouped for comparison,
creation time, hardware-backed indicator, and trust/key-change state. If the
private key is unavailable, packet signing and v2 transport fail closed with
`identity_key_unavailable`; v0.1 historical import/replay remains readable.

## Rust/Windows

The current node creates `data_dir/daovibe.sqlite3` and has no key store. A
future implementation should place an encrypted identity-key file beside the
database with owner-only ACLs, preferably wrapped by Windows DPAPI/CNG or an
equivalent OS-protected facility. Filesystem permissions alone are not
hardware-backed security. A passphrase-derived key (memory-hard KDF and AEAD
from an audited library) is an explicit alternative for unattended nodes; the
CLI must make locked/unavailable state visible without printing the secret.

Backups must declare whether they include the encrypted private key, public
identity metadata, or ledger only. Restoring a database without its matching
key leaves the node `identity_key_unavailable`; restoring a key without its
binding database is refused until the node ID and public-key fingerprint match.

## Key lifecycle

States are `uninitialized`, `available`, `legacy_unverified`, `trusted`,
`key_changed`, `revoked`, and `unavailable`. A fingerprint is SHA-256 of the
canonical raw public-key bytes, lowercase hex (64 characters), displayed in
groups of four. Public-key encoding is raw Ed25519 32-byte bytes encoded as
unpadded base64url on the wire.

Normal rotation is authorized by an old-key signature over a domain-separated
record containing node ID, old fingerprint, new fingerprint, scheme, and
monotonic creation time. Peers verify the old key, then mark the new key
trusted after local policy. If the old key is unavailable, only explicit local
recovery plus out-of-band peer re-verification can move `key_changed` to
`trusted`; a new key alone can never seize an existing node ID. Suspected
compromise immediately marks the old key revoked and blocks packet signing and
v2 sessions until re-verification.

The rotation preimage is UTF-8
`daovibe/mycelium/key-rotation/v2\0` followed by canonical JSON of
`node_id`, `old_fingerprint`, `new_fingerprint`, `identity_key_scheme`, and
`key_created_at`; the NUL separator and field names are fixed for vectors.

Lost device, reinstall, database-only restore, and key-only restore all surface
the same bounded failure categories and require explicit recovery. An optional
future recovery package may contain threshold/out-of-band approvals; it is not
part of v0.2.

## v0.2A implementation facts (2026-09-30)

The Android minSdk-26 capability spike found no portable direct Ed25519
Android-Keystore path that could be assumed for the supported runtime. v0.2A
therefore uses Bouncy Castle `bcprov-jdk18on:1.82` for Ed25519 seed/public-key
operations and an Android Keystore AES/GCM/NoPadding key for wrapping. Every
wrap uses a fresh 12-byte IV and authenticated format/node/scheme AAD. The
ciphertext blob is versioned and kept in app preferences; plaintext seed and
wrapping keys are never persisted there. Hardware-backed status is reported
only when the provider exposes it; otherwise it is `unknown`.

Windows uses `ed25519-dalek:2.2.0` and Windows user-scoped DPAPI via
`windows-sys:0.59`. The versioned `identity-key-v1.bin` blob includes the
node-id binding, public key, and fingerprint metadata and is atomically created
with a no-clobber rename after protection. An existing destination is
recovered/validated and never overwritten. Missing, malformed, unprotectable,
or mismatched material marks the existing binding unavailable; no replacement
key is minted.

The implementation deliberately does not change packet signatures, transport,
HELLO/ACCEPT, pairing, invite v1, or ledger export/import behavior.
