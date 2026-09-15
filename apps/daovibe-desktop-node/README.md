# DAOVibe Desktop Node

This is the first independent computer-side DAOVibe node. It keeps its own
immutable identity and SQLite-backed packet ledger, pairing records, and peer
sync cursor state. It speaks the existing Android `daovibe-pairing-v1`,
`daovibe-connection-v1`, and `daovibe-sync-v1` application protocols over the
same four-byte big-endian length-prefixed UTF-8 framing.

The Android node and desktop node are separate peers:

```text
Android Node != Desktop Node
```

The desktop advertises only `mycelium`, `packet_ledger`, and
`persistent_storage`. It does not advertise compute, cache, verification, or
relay capabilities.

## Build and run

Use the repository-pinned Rust toolchain:

```powershell
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo run -- identity
```

The default Windows database directory is `%LOCALAPPDATA%\DAOVibe` and can be
overridden with `--data-dir`. `daovibe-desktop --help` lists all commands.

```powershell
daovibe-desktop identity
daovibe-desktop set-name "Office Node"
daovibe-desktop pairing offer .\offer.json
daovibe-desktop pairing list
daovibe-desktop listen --host 127.0.0.1 --port 4242
daovibe-desktop ledger status
daovibe-desktop sync-status
```

`pairing offer` displays the requesting node metadata and requires an explicit
approval. `--yes` and `--reject` are available for scripted local workflows.

## Protocol and limits

The listener validates target identity, an active local pairing, session and
protocol versions, and capabilities before sending `CONNECTION_ACCEPT`. It
then serves up to 20 bounded sync windows on the temporary connection. Each
window has at most 50 packets and 64 KiB of canonical JSON. Frames and socket
reads have bounded sizes and timeouts; malformed input closes only that
connection.

The packet ledger accepts the current Android packet types: `phrase_observed`,
`meaning_proposal`, `meaning_vote`, and `safety_label`. Packet IDs, authors,
hashes, payloads, expiry checks, and development signature behavior are
preserved. Development signatures are not cryptographic authentication.

The desktop-side sync client is deferred. The responder/listener path is the
interoperability priority for this milestone. Direct reachability still
depends on the host firewall, NAT, CGNAT, and router configuration; binding a
listener does not make a computer globally reachable.

The current boundary provides pairing, Node ID, session, protocol, packet, and
resource-limit correlation. It does not provide public-key identity,
encryption, secure key exchange, certificate trust, MITM protection, or Sybil
resistance.

Later desktop responsibilities may include heavier storage, caching, a WASM
sandbox, compute, verification, and relay behavior only after separate
protocol and security designs. They are intentionally not implemented here.
