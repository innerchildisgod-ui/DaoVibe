# DAOVibe Desktop Node Foundation

The desktop node is an independent DAOVibe peer:

```text
Android Node != Desktop Node
```

```text
Desktop Node
    |
    +-- immutable local identity (role: computer)
    +-- SQLite device identity, packet ledger, pairings, and peer cursors
    +-- explicit local pairing approval
    +-- TCP listener with bounded Android-compatible framing
    +-- daovibe-connection-v1 handshake
    +-- daovibe-sync-v1 responder
```

The packet ledger is authoritative. Sync transfers packet-ledger entries only;
derived phone state and desktop resident state are not copied or merged. The
desktop keeps remote packet authors and packet IDs unchanged.

The current listener is a foreground CLI process. It accepts an explicitly
configured host and port, serves a temporary paired connection, and then
closes it. A successful bind is local listening state, not proof of internet
reachability. Firewalls, NAT, CGNAT, and router configuration may prevent a
phone from connecting.

Pairing is explicit local approval plus challenge correlation. The connection
and sync protocols add Node ID, session, version, cursor, packet, and resource
validation. This remains development-grade peer correlation; it is not secure
or cryptographically authenticated. Public-key identity, encryption, key
exchange, NAT traversal, relays, discovery, gossip, compute, WASM, and
verification remain future milestones.

The desktop responder advertises only capabilities implemented in this
foundation: `mycelium`, `packet_ledger`, and `persistent_storage`.
