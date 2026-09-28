You are continuing the DAOVibe / Mycelium repository at:

C:\Users\ADMIN\DaoVibe

CURRENT STATUS

The previous milestone, Mycelium Correction Tombstones, is complete and verified.

Android:
- testDebugUnitTest PASS
- assembleDebug PASS
- 161 tests, 0 failures

Rust:
- fmt --check PASS
- clippy -D warnings PASS
- cargo test PASS
- 42 library tests passed
- 1 binary test passed
- 0 doc-test failures

git diff --check PASS.

Canonical fingerprints that MUST remain unchanged:

Convergence:
aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0

Canonicalization edge:
7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab

Correction:
455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f

Correction tombstone:
82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52

IMPORTANT WORKTREE RULES

The worktree intentionally contains uncommitted work from previous Mycelium milestones.

Do NOT:
- reset
- clean
- revert
- checkout
- stash
- commit
- push
- delete or overwrite existing Mycelium work
- delete physical pairing evidence
- modify node identities
- modify firewall settings
- automate phone taps/swipes/typing
- perform physical-device testing

Do NOT modify:
apps/daovibe-android/build.gradle.kts

That file contains a pre-existing user modification.

Do NOT build:
- Compute/WASM
- EEE
- SBP
- DHT
- NAT traversal
- Bluetooth mesh
- Wi-Fi Direct
- hotspot transport
- crypto upgrades
- central servers

==================================================
NEXT MILESTONE
MYCELIUM MULTI-PEER SYNC + RECONNECT
==================================================

Goal:

Turn the existing proven direct two-node sync into a robust multi-peer Mycelium transport layer that can remember multiple approved peers, reconnect to known peers, maintain an independent sync cursor per peer, and converge packet history across a small peer set.

This milestone is NOT peer discovery.

Peers are added only through existing/manual development pairing or explicit peer configuration.

No DHT, public bootstrap service, cloud relay, central coordinator, or NAT traversal.

The packet ledger remains authoritative.

Same valid packet history must continue to derive exactly the same state.

==================================================
1. CORE SEMANTICS
==================================================

Support multiple known/approved peers.

Each peer record should contain only the minimum connection metadata needed by the existing transport, such as:

- peer node ID
- display name if already available
- host/address
- port
- pairing/development relationship identifier if required by current code
- last successful contact timestamp
- last error/status if useful
- independent sync cursor/checkpoint state

Do not invent cryptographic security claims.

Existing development pairing remains development correlation only.

Never call it secure authentication, encryption, proof-of-possession, or MITM protection.

==================================================
2. PERSISTENT PEER REGISTRY
==================================================

Implement a small persistent peer registry using the storage style already used by each platform.

Requirements:

- multiple peers
- peer node ID is the stable identity key
- adding the same peer again updates connection metadata rather than creating duplicates
- local node ID must never be accepted as a remote peer
- invalid/blank host rejected
- invalid port rejected
- peer survives app/node restart
- removing a peer removes only local connection metadata
- removing a peer MUST NOT delete ledger packets or derived Mycelium state
- peer registry is local configuration, not part of canonical Mycelium semantic state
- peer registry MUST NOT affect state-hash

Prefer minimal migrations.
If Android Room migration is required:
- preserve existing data
- make migration deterministic
- add migration/reopen coverage where practical

==================================================
3. PER-PEER SYNC CURSORS
==================================================

Each peer must maintain its own cursor/checkpoint.

Do not share one cursor across all peers.

Preserve the existing cursor format and ordering:

received_at:packet_id

Preserve:
- default 0:
- monotonic cursor behavior
- received_at ASC then packet_id ASC
- current max packet count
- current max byte limit
- atomic import
- authorship preservation
- duplicate semantics

A slow/offline peer must not block progress with another peer.

Restart must preserve per-peer cursor state.

==================================================
4. SYNC ONE PEER
==================================================

Refactor the current direct sync path only as much as necessary so the same logic can sync one selected peer from the peer registry.

A sync attempt should report operational facts such as:

- peer node ID
- connection success/failure
- packets imported
- duplicates
- packets exported/sent if the existing protocol exposes this count
- resulting cursor
- last successful contact
- error text suitable for diagnostics

Operational timestamps/errors are local diagnostics only and MUST NOT affect canonical semantic state.

==================================================
5. SYNC ALL KNOWN PEERS
==================================================

Add a bounded "sync all known peers" operation.

Rules:

- iterate over a deterministic peer order, preferably peer node ID using existing string ordering unless current architecture has a stronger established rule
- one peer failure must not roll back successful sync with another peer
- no unbounded retry loops
- no busy loop
- no background infinite daemon
- no concurrent race-prone writes unless the existing storage architecture clearly supports it
- sequential implementation is acceptable and preferred
- return a result for every attempted peer

If there are zero peers:
return a valid empty result, not an error.

==================================================
6. RECONNECT BEHAVIOR
==================================================

Add a bounded reconnect helper for known peers.

This should NOT become an always-running service.

Requirements:

- explicit/manual reconnect or sync-all trigger
- short bounded retry count
- deterministic retry count
- reasonable fixed or bounded backoff
- no infinite retry
- no hidden network scanning
- no discovery
- no address guessing

Persist only useful peer status/cursor metadata.

Do not store transient secrets.

==================================================
7. MULTI-PEER CONVERGENCE
==================================================

Packets received from Peer A become ordinary local ledger packets and therefore may later be exported to Peer B through the existing packet sync mechanism.

Do not create a second forwarding database.

Do not rewrite packet authors.

Do not rewrite packet IDs.

Do not create forwarding packets.

Existing duplicate-by-packet-ID handling should make repeated propagation idempotent.

Test the conceptual chain:

A -> B -> C

and then:

C -> B -> A

After complete sync, all nodes with the same valid packet set must derive the same canonical state and fingerprint.

==================================================
8. ANDROID UI
==================================================

Add the minimum usable peer-management UI using the existing app architecture.

Provide a small Peers / Sync section that can:

- list known peers
- show node ID
- show host:port
- show last sync/contact status if available
- add/update a peer manually
- remove local peer connection metadata
- sync one peer
- sync all peers

Keep it compact.

Do not redesign unrelated screens.

Do not perform physical testing.

==================================================
9. RUST CLI
==================================================

Extend the existing desktop CLI with minimal peer commands fitting current command style.

Suggested capabilities:

peer-list
peer-add
peer-remove
peer-sync
peer-sync-all

Exact command names may follow current CLI conventions.

Requirements:

- no GUI
- persistent peer registry
- clear success/failure output
- no secret/security claims
- removing peer config never removes ledger data

==================================================
10. PROTOCOL COMPATIBILITY
==================================================

Do not change the wire meaning of existing hello/accept/sync packets unless absolutely necessary.

Prefer reusing the current protocol unchanged.

If a tiny protocol addition is truly required:
- explain why
- keep backward compatibility where practical
- add Android/Rust parity tests

Do not add peer discovery packets.
Do not add gossip protocol packets in this milestone.

==================================================
11. CANONICAL STATE COMPATIBILITY
==================================================

Peer registry and sync status are LOCAL OPERATIONAL STATE.

They MUST NOT enter:
- Mycelium derived semantic snapshot
- canonical state JSON
- state fingerprint

All four existing fingerprints MUST remain unchanged:

aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0
7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab
455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f
82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52

==================================================
12. ANDROID TESTS
==================================================

Add focused tests covering at least:

1. add one peer
2. add multiple peers
3. same peer ID updates instead of duplicates
4. reject local node as peer
5. reject blank host
6. reject invalid port
7. peer registry survives reopen/restart
8. remove peer metadata only
9. ledger remains unchanged after peer removal
10. independent cursor per peer
11. cursor survives restart
12. sync one peer success
13. one peer failure is isolated
14. sync-all zero peers
15. sync-all multiple peers
16. deterministic peer iteration/order
17. duplicate packet propagation remains idempotent
18. forwarded packets preserve original author
19. A -> B -> C convergence using test transport/fakes if practical
20. reverse propagation remains convergent
21. old convergence fingerprint unchanged
22. old canonicalization-edge fingerprint unchanged
23. correction fingerprint unchanged
24. correction tombstone fingerprint unchanged

Use test doubles/local test transport rather than physical networking where appropriate.

==================================================
13. RUST TESTS
==================================================

Add equivalent focused coverage:

- peer registry add/update/list/remove
- persistence/reopen
- local-node rejection
- host/port validation
- independent per-peer cursors
- cursor persistence
- sync-one behavior
- sync-all behavior
- one-peer failure isolation
- deterministic peer order
- duplicate propagation idempotence
- authorship preservation
- A -> B -> C packet convergence using localhost/in-memory test infrastructure
- reverse propagation convergence
- ledger survives peer config removal
- all four existing fingerprints unchanged

Do not rely on external internet access in tests.

==================================================
14. SAFETY / BOUNDS
==================================================

Preserve all existing packet validation.

Preserve:
- max sync packet count
- max sync bytes
- atomic import
- cursor monotonicity
- duplicate rules
- packet expiry rules
- payload hash validation
- packet ID validation
- development signature behavior
- dependency validation

Do not weaken any prior invariant to make multi-peer tests pass.

==================================================
15. VERIFICATION
==================================================

Run sequentially.

ANDROID:

cd C:\Users\ADMIN\DaoVibe\apps\daovibe-android

.\gradlew.bat testDebugUnitTest --no-daemon --console=plain

Then:

.\gradlew.bat assembleDebug --no-daemon --console=plain

Both must have reliable BUILD SUCCESSFUL output.

RUST:

cd C:\Users\ADMIN\DaoVibe\apps\daovibe-desktop-node

cargo +1.90.0-x86_64-pc-windows-gnu fmt --check

cargo +1.90.0-x86_64-pc-windows-gnu clippy --all-targets --all-features -- -D warnings

cargo +1.90.0-x86_64-pc-windows-gnu test

ROOT:

cd C:\Users\ADMIN\DaoVibe

git diff --check
git status --short

==================================================
16. HANDOFF
==================================================

Update:

C:\Users\ADMIN\DaoVibe\.daovibe\handoff\latest.md

Preserve existing milestone information.

Append:

# Mycelium Multi-Peer Sync + Reconnect

Record:
- peer registry semantics
- per-peer cursor semantics
- sync-one behavior
- sync-all behavior
- reconnect bounds
- multi-peer convergence behavior
- Android UI work
- Rust CLI work
- tests
- all four unchanged fingerprints
- repository verification
- explicit note that no physical test, commit, or push occurred

Do not claim Git can restore ignored handoff history.

==================================================
17. FINAL REPORT
==================================================

When finished, report:

1. exact files changed
2. peer registry model/schema
3. peer identity key
4. add/update/remove semantics
5. host/port validation
6. per-peer cursor design
7. cursor persistence
8. sync-one behavior
9. sync-all behavior
10. retry/reconnect bounds
11. failure isolation
12. packet forwarding semantics
13. authorship preservation
14. duplicate/idempotence behavior
15. A -> B -> C convergence test
16. reverse convergence test
17. Android UI changes
18. Rust CLI commands
19. all four fingerprints and proof unchanged
20. Android test result
21. Android assemble result
22. Rust fmt result
23. Rust clippy result
24. Rust test counts
25. git diff --check result
26. git status summary
27. whether build.gradle.kts was touched
28. whether physical testing happened
29. whether commit/push happened
30. unresolved issues, if any

STOP after this milestone.

Do not start discovery, DHT, gossip, NAT traversal, Compute, EEE, SBP, or any later milestone.
