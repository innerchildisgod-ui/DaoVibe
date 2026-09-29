# Mycelium self-correcting meanings handoff

Date: 2026-09-24

## Milestone

Implemented deterministic self-correcting meanings for Mycelium using two new packet types:

- correction_proposed
- correction_vote

No tombstones, Compute/WASM, EEE, SBP, discovery, DHT, NAT traversal, crypto upgrades, or physical-device testing were added.

## Correction proposal

A correction proposal contains:

- correction_id
- phrase_id
- meaning_id
- reference_meaning
- optional context
- confidence

The targeted meaning must already exist.

The correction proposal parent is the exact packet_id of the targeted meaning proposal.

Android-generated correction IDs are deterministic hashes of canonical data containing:

- phrase_id
- meaning_id
- reference_meaning
- context, including null
- confidence

This prevents semantically distinct correction proposals from collapsing onto the same generated correction ID.

## Correction vote

A correction vote contains:

- correction_id
- phrase_id
- meaning_id
- vote
- confidence

Vote is confirm or reject.

The correction vote parent is the exact packet_id of its correction_proposed packet.

The phrase_id, meaning_id, and correction_id tuple must match the proposal exactly.

Replay, receive/import validation, and Rust sync import enforce these dependencies.

## Voting semantics

Latest valid correction vote per identified voter counts once.

Existing StableVoteKey semantics are preserved.

Vote confidence is not used as a vote weight.

Correction score uses the existing meaning formula:

score =
clamp(
    proposal_confidence
    + vote_balance * min(total_votes / 3, 1) * 0.5,
    -1,
    1
)

A correction is eligible only when:

- confirms > rejects
- confirms >= 1

A correction proposal alone therefore cannot become effective.

Among eligible corrections:

1. highest score wins
2. exact score tie uses the smallest correction_id under Kotlin-compatible UTF-16 ordering

Rust explicitly matches Kotlin UTF-16 ordering rather than ordinary Rust Unicode scalar ordering.

## Original and effective meaning

The original meaning proposal remains immutable and traceable.

Derived state exposes the effective corrected meaning as an overlay.

If an effective correction has context = null, effective_context is exactly null.

It does not fall back to the original context.

If no correction is effective, the original reference meaning and original context remain effective.

Vote changes can therefore cause derived state to move from one correction to another or back to the original meaning without rewriting history.

## Canonical state

Correction semantic fields are encoded only when corrections exist for that meaning.

Meanings with zero corrections retain the previous canonical representation.

Existing no-correction fingerprints remain unchanged:

Convergence fixture:
aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0

Canonicalization-edge fixture:
7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab

Shared correction fixture:

apps/daovibe-android/app/src/test/resources/fixtures/mycelium_state_correction.json

Canonical UTF-8 byte length:
1080

SHA-256:
455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f

The fixture exercises correction candidates, latest-voter replacement, null effective context, score ties, and Kotlin UTF-16 correction ordering.

## Android

Implemented correction packet payloads, codec support, validation, deterministic replay, repository creation/voting paths, dependency checks, canonical snapshot support, and correction UI.

Correction proposals use the actual meaning proposal packet as parent.

Correction votes use the actual correction proposal packet as parent.

Phrase detail UI exposes original meaning data, effective meaning data, correction candidates, proposal controls, voting controls, confidence, and the effective candidate marker.

Verification completed:

testDebugUnitTest:
PASS

assembleDebug:
PASS

## Rust desktop node

Implemented matching correction payload validation, replay semantics, deterministic candidate ordering, canonical snapshot behavior, exact parent/target dependency validation, and sync-import behavior.

Verification completed:

cargo +1.90.0-x86_64-pc-windows-gnu fmt --check:
PASS

cargo +1.90.0-x86_64-pc-windows-gnu clippy --all-targets --all-features -- -D warnings:
PASS

cargo +1.90.0-x86_64-pc-windows-gnu test:
PASS

Library tests:
41 passed, 0 failed

Binary tests:
1 passed, 0 failed

Doc tests:
0 failed

Correction-specific Rust tests include:

- fixed canonical JSON/bytes/hash fixture verification
- reversal and duplicate convergence
- wrong parent/target rejection
- exact correction proposal parent during sync import
- Kotlin UTF-16 ordering behavior

## Repository verification

git diff --check:
PASS

Only LF/CRLF working-copy warnings were reported.

---

# Multi-peer sync + reconnect audit (2026-09-27)

The bidirectional wire semantics are now explicit. The initiator pulls the responder's ledger, then the responder sends normal `SYNC_REQUEST` frames; the initiator answers with exported ordinary ledger batches. Imported packets therefore remain normal packets with original packet IDs/authors and can propagate A -> B -> C and C -> B -> A without forwarding records or rewritten identity. Rust `sync_peer` no longer performs a second client pull. Android `SyncResponder` uses the same reverse request/response direction, and Android loopback multi-window tests exercise it.

Android Network Sync and Sync-all controls route through `PeerSyncCoordinator`: sequential deterministic node-ID order, at most two attempts, fixed 150 ms backoff, and failure isolation. Room was version 4; it is now version 5 with idempotent `MIGRATION_4_5` creating `known_peers`; migration/reopen coverage preserves identity and ledger data. `build.gradle.kts` was not touched by this milestone.

Verification: Android `testDebugUnitTest` BUILD SUCCESSFUL (169 tests, 0 failures); `assembleDebug` BUILD SUCCESSFUL; Rust fmt/clippy PASS; Rust cargo test PASS (42 library + 1 binary, 0 doc-test failures); `git diff --check` PASS with only existing LF/CRLF warnings. Unchanged fingerprints: `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`, `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`, `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`, `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.

No physical-device testing, commit, or push occurred. No discovery, DHT, gossip, NAT traversal, Compute, EEE, or SBP work was started. Rust now includes and passes the dedicated production-path three-node localhost convergence test `node::tests::three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing`.

The worktree intentionally remains uncommitted.

No reset, clean, revert, checkout, stash, commit, or push was performed.

The pre-existing apps/daovibe-android/build.gradle.kts modification remains in the worktree and was not introduced as part of the correction milestone.

No physical-device test was performed for this milestone.

No firewall or networking configuration was changed.

## Handoff history note

.daovibe/handoff/latest.md is ignored by Git and was not present in HEAD.

An earlier version of this ignored file had already been overwritten during the correction work, so its exact previous historical contents could not be recovered from Git.

Before replacing the stale handoff, the existing file was preserved at:

$env:TEMP\daovibe-latest-self-correcting-20260924.md

---

# Mycelium Correction Tombstones

## Protocol semantics

Added exactly `correction_tombstone_proposed` and `correction_tombstone_vote`.
Tombstone proposals retain the target correction in ledger history and require the exact `correction_proposed` packet ID as parent. Tombstone votes require the exact tombstone-proposal packet ID as parent and must match phrase, meaning, correction, and tombstone IDs exactly.

Android tombstone IDs are deterministic hashes of canonical phrase, meaning, correction, reason, and confidence data. Required IDs/reasons are non-blank; votes are confirm/reject; confidence is finite and in [0,1].

## Deterministic rules

Latest valid vote per identified voter wins by created_at then packet_id. Vote confidence is not weighted. Tombstone score uses the existing correction formula and eligibility (`confirms > rejects` and `confirms >= 1`). Eligible tombstones select highest score; exact ties use smallest tombstone ID under Kotlin UTF-16 ordering, explicitly matched in Rust.

An effective tombstone excludes only its correction from effective-correction selection. The correction remains immutable and visible with tombstone history. If support later becomes ineligible, the correction reactivates; otherwise selection falls back to another active correction or the original meaning/context, preserving explicit null context semantics.

Out-of-order replay defers exact correction/tombstone dependencies. Sync/import validation accepts only existing or earlier valid same-batch dependencies and remains atomic; duplicate packets remain harmless and conflicting packet IDs remain deterministic errors.

## Canonical compatibility and fixture

With no tombstone history, correction canonical snapshots remain byte-for-byte compatible. Existing fingerprints remain unchanged:

- Convergence: `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`
- Canonicalization edge: `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`
- Correction: `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`

Shared fixture: `apps/daovibe-android/app/src/test/resources/fixtures/mycelium_state_correction_tombstone.json`

- UTF-8 canonical byte length: `1501`
- SHA-256: `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`

## Verification

- Android `testDebugUnitTest`: BUILD SUCCESSFUL, 161 tests, 0 failures
- Android `assembleDebug`: BUILD SUCCESSFUL
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu fmt --check`: PASS
- Rust clippy with `-D warnings`: PASS
- Rust tests: 42 library passed, 1 binary passed, 0 doc-test failures
- `git diff --check`: PASS (only existing LF/CRLF working-copy warnings)

## Repository status

The worktree remains intentionally uncommitted with prior milestone changes preserved. `apps/daovibe-android/build.gradle.kts` remains the pre-existing user modification and was not touched for this milestone. No commit, push, reset, clean, revert, checkout, stash, physical-device test, or firewall/network change occurred.

---

# Mycelium Multi-Peer Sync + Reconnect

## Peer registry and cursors

Added local `known_peers` metadata keyed by stable remote node ID. Records contain optional display name, trimmed host, validated TCP port, pairing ID, last successful contact, last error, and local update time. Add/update is an upsert; local identity, blank hosts, blank pairing IDs, and ports outside 1..65535 are rejected. Removal deletes only connection metadata and never packets, sync state, or derived state. Android uses Room database version 5 with MIGRATION_4_5 creating known_peers for existing installations; Rust creates the same table idempotently in SQLite.

The existing authoritative per-peer cursor remains keyed by remote node ID and pairing ID, using `received_at:packet_id`, `0:` default, ascending ledger order, bounded packet/byte windows, atomic import, duplicate-by-packet-ID behavior, and authorship preservation. Peer registry/status fields are not included in semantic snapshots or state hashes.

## Sync and reconnect

Android `PeerSyncCoordinator` provides explicit sequential `syncOne` and `syncAll` operations in deterministic node-ID order, with at most two attempts and a fixed 150 ms retry backoff. The existing direct hello/accept and bidirectional sync wire protocol is reused unchanged. The Network screen now lists/configures/removes peers and offers per-peer and all-peer sync controls.

Rust adds `peer list`, `peer add`, `peer remove`, `peer sync`, and `peer sync-all` commands. Sync-one reuses the existing bounded TCP protocol, preserves independent cursors and packet authors, and marks local diagnostics only. Sync-all is sequential and isolates failures while continuing through the deterministic registry order. Packets imported from one peer remain ordinary ledger packets and can later propagate to another peer without forwarding records or rewritten IDs/authors; repeated propagation is idempotent.

## Tests and canonical compatibility

Android added focused registry tests for add/update/deduplication, local-node/host/port validation, persistence/reopen, and metadata-only removal with ledger preservation. Android test suite: BUILD SUCCESSFUL, 169 tests, 0 failures. Android assembleDebug: BUILD SUCCESSFUL.

Requested verification rerun: `testDebugUnitTest` and `assembleDebug` both reported `BUILD SUCCESSFUL` (all tasks up-to-date).

Rust tests: 43 library tests passed, 1 binary test passed, 0 doc-test failures. Rust fmt --check and clippy `-D warnings` passed. The dedicated production-path test `node::tests::three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing` proves A -> B -> C and C -> B -> A through A <-> B and B <-> C only (no direct A <-> C pairing), preserving packet IDs, authors, canonical JSON, duplicate idempotence, and equal final A/B/C canonical fingerprints. No protocol discovery or gossip packets were added.

Unchanged fingerprints:

- Convergence `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`
- Canonicalization edge `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`
- Correction `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`
- Correction tombstone `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`

Repository `git diff --check` passed. The worktree remains intentionally uncommitted and contains prior milestone changes. No physical testing, commit, or push occurred; no firewall or node identity changes were made. `apps/daovibe-android/build.gradle.kts` was not touched by this milestone (its pre-existing modification remains).

---

# Mycelium Peer Invite Bootstrap

Invite schema/version: version `1`; required `source_node_id`, `host`, `port`, `pairing_id`, `created_at`, `expires_at`, `connection_version`, and `packet_protocol_version`; optional `source_display_name`, bounded `capabilities`, and `note`. Canonical representation is UTF-8 compact JSON with lexicographically sorted object keys, sorted capabilities, and omitted optional null fields. The compact transport is `daovibe://peer-invite?v=1&data=<unpadded URL-safe base64(canonical JSON)>`.

`invite_id` is the lowercase SHA-256 of canonical invite JSON. It is for correlation/deduplication/debugging only and is not authentication, encryption, proof-of-possession, or MITM protection. Expiry is strict: an invite is rejected when `now >= expires_at`; `expires_at` must be at least `created_at`. Unknown invite versions, unsupported connection/packet versions, malformed/oversized payloads, blank bounded fields, and ports outside 1..65535 are rejected. Secrets are not included.

Android adds `PeerInvite`/`PeerInviteCodec`, a Peer invite section on Network, create/copy/share payload, pasted canonical/deep-link preview, and explicit Add/update confirmation. Import upserts existing local `known_peers` by remote node ID, rejects the local node, never auto-connects, and leaves ledger/cursors/semantic fingerprints unchanged. Rust adds `peer invite create`, `peer invite parse`, and `peer invite import`; parse validates without mutation and import explicitly upserts local peer metadata with the same idempotence and local-node rejection rules.

Shared fixture: `shared/fixtures/mycelium_peer_invite.json` (mirrored in Android test resources); canonical UTF-8 byte length `353`; SHA-256/invite_id `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`. Android and Rust exact canonical bytes/hash/payload parity tests pass.

Android verification: `testDebugUnitTest` BUILD SUCCESSFUL, 175 tests, 0 failures; `assembleDebug` BUILD SUCCESSFUL. Rust verification: `fmt --check` PASS; clippy `--all-targets --all-features -- -D warnings` PASS; cargo test PASS (45 library tests, 1 binary test, 0 doc-test failures). The existing `node::tests::three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing` still passes.

Unchanged fingerprints: convergence `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`; canonicalization edge `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`; correction `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`; correction tombstone `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.

`git diff --check` PASS with existing LF/CRLF warnings. No physical testing, firewall change, commit, or push occurred. `apps/daovibe-android/build.gradle.kts` was not touched by this milestone. No unresolved invite issues remain; actual camera QR rendering/scanning is intentionally deferred.

---

# Mycelium Peer Invite Bootstrap — audit and gap repair

Peer invites/pairing remain development correlation only: not authentication, encryption, proof-of-possession, or MITM protection.

- Rust `DesktopNode::create_peer_invite` now loads the current local identity and requires the supplied pairing ID to exist, be `approved`, belong to that local node, and match the requested relationship. Unknown, inactive/rejected, and wrong-local pairings reject before invite generation. Focused test: `node::tests::create_peer_invite_requires_approved_local_pairing`.
- Android `PeerRegistryRepository.importInvite` now calls `PeerInviteCodec.validate(invite, nowSeconds())` at the repository boundary before local-node checking/upsert. Expired, unsupported invite/connection/packet versions, blank/oversized fields, invalid ports, and local-node invites are rejected even when UI preview is bypassed. Repeated import still updates/deduplicates by remote node ID.
- Android has an actual platform `ACTION_SEND` / `text/plain` chooser action labeled `Share invite`; the payload is the only shared content and no dependency/build-file change was added.
- Android semantic isolation test: `PeerInviteTest.repositoryImportValidatesInviteAndPreservesSemanticState` passes, proving invite import leaves the packet ledger empty and the canonical semantic fingerprint unchanged.
- Rust semantic isolation test: `node::tests::importing_peer_invite_leaves_ledger_and_semantic_fingerprint_unchanged` passes, proving invite import/upsert leaves the packet ledger and Mycelium fingerprint unchanged.
- Rust invite coverage now includes malformed/non-canonical/oversized payload rejection, strict expiry, unsupported versions, blank fields, invalid port, approved-pairing creation enforcement, repeated import deduplication, local-node rejection, and ledger/fingerprint isolation. Android includes direct repository-boundary validation and malformed/non-canonical base64 coverage.
- Canonical base64 transport is URL-safe, unpadded, and exact: decoded bytes must re-encode to the exact `data` segment; invalid length/trailing-bit variants and non-canonical encodings reject on Android and Rust. The shared valid fixture payload remains byte-for-byte unchanged.

Verification after repair:

- Android `testDebugUnitTest`: BUILD SUCCESSFUL, 177 tests, 0 failures.
- Android `assembleDebug`: BUILD SUCCESSFUL.
- Rust `fmt --check`: PASS.
- Rust `clippy --all-targets --all-features -- -D warnings`: PASS.
- Rust `cargo test`: PASS, 49 library tests, 1 binary test, 0 doc-test failures.
- `node::tests::three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing`: PASS.
- Shared fixture unchanged: canonical UTF-8 bytes `353`; invite_id `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`; existing payload unchanged.
- All four old Mycelium fingerprints remain unchanged: `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`, `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`, `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`, `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.
- Root `git diff --check`: PASS. Worktree remains intentionally uncommitted with prior milestone changes; no commit/push. `apps/daovibe-android/build.gradle.kts` was not touched by this repair (its pre-existing modification remains). No physical testing or firewall changes occurred. No unresolved issues for this requested milestone.

---

# Mycelium Peer Health + Sync Diagnostics

Audit/repair completed on the interrupted partial milestone. Structured results are `remote_node_id`, `outcome` (`success`/`failed`), `stage`, optional evidence-based `error_category`, `attempts`, `imported_packets`, `duplicate_packets`, nullable `exported_packets`, `started_at`, `finished_at`, bounded `message`, and nullable cursor. Exported count remains null because the production path does not measure it.

Health is deterministic and local-only: `never_contacted` means no success and no failure; `error` means a failure is newer than success or there is a failure with no success; `healthy` means success is at least as new as failure and age is `<= 86,400` seconds; `stale` means the same ordering with age `> 86,400` seconds. The exact 24-hour boundary is healthy.

Classification now uses concrete Rust `TransportError`, `ProtocolError`, `StorageError`, and I/O kinds, plus Android transport failure codes and explicit rejection reason codes. Bounded message inspection is only a fallback for otherwise-untyped invalid-operation text; no broad substring guessing is used for protocol/pairing/frame claims.

Android Room is version 6 with non-destructive `MIGRATION_5_6`; existing known-peer rows are preserved and nullable diagnostic columns are added. MainActivity now registers the migration. Rust SQLite initialization checks `pragma_table_info` before adding each nullable diagnostic column, preserving old rows. Success updates latest success/outcome while retaining historical `last_failure_at`, `last_error`, and category. A later success therefore becomes healthy without erasing the useful last failure.

Android Network UI shows peer identity, endpoint, health, last success/failure, latest outcome/stage/category, bounded message, Sync, user-triggered Retry after failure, and Copy diagnostics. Copied diagnostics include `local_node_id`, `remote_node_id`, endpoint, health, timestamps, outcome/stage/category, attempts, counts, and cursor; they exclude PINs, credentials, payloads, and private data. No Diagnose action is exposed because the existing server handshake immediately proceeds into sync; implementing a true non-mutating hello/accept diagnostic would require protocol/server scope, so Diagnose is explicitly deferred. Rust likewise removed the misleading `peer diagnose` command; `peer sync`/`peer sync-all` remain ordinary bounded sync and `peer list` now shows health.

Android retry returns and persists the actual final typed result; retry-then-success reports attempts=2, while exhaustion reports the final attempt's category/stage/message. Rust `peer sync` uses the same ordinary validated sync path, bounded to two attempts, and returns/persists the final failed attempt rather than the first error. Sync-all remains deterministic and failure-isolated.

Semantic isolation remains covered by the existing Android/Rust invite/diagnostic state tests: local operational metadata does not alter ledger packets or canonical fingerprints; ordinary Sync is the only path that imports validated packets. The three-node production sync test remains green.

Verification: Android `testDebugUnitTest` PASS, 179 tests/0 failures (including health-boundary and concrete-classification coverage); `assembleDebug` PASS. Rust `fmt --check` PASS; clippy `-D warnings` PASS; cargo test PASS (49 library, 1 binary, 0 doc-test failures). Three-node production sync PASS. Root `git diff --check` PASS. Invite canonical representation remains 353 bytes with invite_id `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`. All four Mycelium hashes remain unchanged: `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`, `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`, `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`, `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.

`apps/daovibe-android/build.gradle.kts` was not touched during this repair (its pre-existing modification remains). No physical testing, firewall changes, commit, or push occurred. Unresolved issue: true non-mutating Diagnose remains deferred pending an explicit protocol/server design.

---

# Mycelium Handshake-Only Diagnose

- Zero new wire message types were added. Diagnose uses `CONNECTION_HELLO` -> `CONNECTION_ACCEPT` and closes before any `SYNC_REQUEST`.
- After ACCEPT, a clean EOF before the first sync frame is a graceful handshake-only completion. Partial length/payload, malformed frames, malformed HELLO, rejects, and invalid sync requests remain errors.
- Android and Rust now expose aligned `PeerDiagnoseResult` models with remote node, outcome, stage, optional evidence-based error category, timestamps, latency, and bounded message.
- Diagnose is exactly one explicit attempt with no retry, scheduler, WorkManager, discovery, or background probing.
- Android Room is v7 with exact `MIGRATION_6_7`; Rust adds idempotent nullable `last_diagnostic_at`, outcome, stage, error category, message, and latency columns.
- Dedicated diagnostic metadata is separate from latest-sync fields. Contact timestamps may update health, while historical failure details, sync counts, outcomes, stages, categories, and cursors remain intact.
- Android Network rows expose Diagnose and a separate summary; Copy diagnostics includes sync plus diagnose metadata and excludes secrets, payloads, invites, and ledger contents.
- Rust adds `peer diagnose <node_id>` and compact output; `peer list` includes a compact latest-diagnose summary.
- Android uses the existing handshake-only `connectToPairedNode` path; Rust writes HELLO, validates ACCEPT identity/version/pairing, and never sends a sync request. Ledger, cursor, and semantic state/fingerprint are unchanged.
- Classification uses concrete endpoint/transport/protocol/pairing evidence for invalid config, unreachable, timeout, pairing mismatch, protocol mismatch, remote rejected, malformed frame, IO, or unknown.
- Android `testDebugUnitTest`: BUILD SUCCESSFUL. Android `assembleDebug`: BUILD SUCCESSFUL.
- Rust fmt --check: PASS; clippy with `-D warnings`: PASS; cargo test: 49 library tests, 1 binary test, 0 doc-test failures.
- Localhost handshake+sync and three-node A -> B -> C / C -> B -> A production sync remain green.
- Invite canonical bytes/id remain 353 / `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`; all four Mycelium hashes remain unchanged.
- Root `git diff --check`: PASS. `build.gradle.kts` remains the pre-existing untouched modification; helper prompt files remain untouched.
- Physical testing: no. Firewall changes: no. Commit/push: no.
- Unresolved issues: no known implementation blocker; dedicated new Diagnose isolation tests beyond existing regression coverage were not added in this pass.

---

# Mycelium Handshake-Only Diagnose — completion update

Date: 2026-09-29

- No new wire message types were added. Diagnose is exactly `CONNECTION_HELLO` -> `CONNECTION_ACCEPT` -> client clean close; the client performs exactly one attempt and never enters packet sync.
- The Android path used by `PeerSyncCoordinator.diagnoseOne` is the existing `ConnectionRepository.connectToPairedNode` handshake-only path. Rust `peer diagnose <node_id>` writes one HELLO, validates the ACCEPT identity/version/pairing, then closes. Neither path sends `SYNC_REQUEST`, imports/exports batches, advances a cursor, changes the packet ledger, or changes semantic state/fingerprint.
- `PeerDiagnoseResult` carries remote node ID, success/failed outcome, connect/hello/accept/complete stage, optional evidence-based category, timestamps, latency, and bounded message. Diagnose has no retry; normal Sync remains at most two attempts with the fixed 150 ms retry.
- Android Room is version 7 and every production builder, including `MainActivity`, registers `DaoVibeDatabase.MIGRATION_6_7`. The migration only adds six nullable diagnostic columns. The v6 -> v7 test preserves an existing `known_peers` row and all Sync fields while leaving new Diagnose fields null; the full migration chain still opens.
- Rust SQLite schema extension is idempotent and nullable, preserving old `known_peers` rows and all Sync metadata/counts/cursor. Dedicated metadata is `last_diagnostic_at`, `last_diagnostic_outcome`, `last_diagnostic_stage`, `last_diagnostic_error_category`, `last_diagnostic_message`, and `last_diagnostic_latency_ms`. Diagnose does not overwrite latest Sync outcome/stage/category/attempts/imported/duplicate/exported/start/finish/cursor. Success may update contact health; later success preserves historical failure time/message.
- Clean EOF is narrow: after the server has sent ACCEPT, zero bytes before the first sync frame succeeds as a handshake-only close. Partial four-byte length, partial payload, malformed UTF-8, zero/oversized frames, malformed sync requests, and ordinary sync failures remain errors in Android and Rust.
- Classification is evidence-based. Pairing-not-found/inactive/peer-mismatch (and Rust structured `pairing_*`) map to `pairing_mismatch`; unsupported/incompatible connection or packet versions map to `protocol_mismatch`; other explicit reject reasons map to `remote_rejected`; malformed/truncated frames map to `malformed_frame`; invalid endpoint, timeout, unreachable/refused, IO, and otherwise unknown retain their specific categories. Android no longer treats every `ConnectionProtocolException` as pairing mismatch, and Rust classifies the structured `Reject.reason_code` before message fallback.
- Android UI exposes Diagnose separately from Sync and Copy diagnostics includes local/remote IDs plus Sync and Diagnose summaries while excluding packet payloads, pairing secrets, and diagnostic/error message contents. Rust CLI includes `peer diagnose <node_id>` and `peer list` diagnosis summaries.
- Focused coverage now proves Android one-attempt success/failure, no `SYNC_REQUEST`, clean EOF vs truncated first frame, ledger/cursor/semantic isolation, dedicated metadata persistence and Sync metadata preservation, reject categories, diagnostics privacy, and Room migration preservation. Android `testDebugUnitTest`: BUILD SUCCESSFUL, **188 tests passed, 0 failures**. Android `assembleDebug`: BUILD SUCCESSFUL.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu fmt --check`: PASS. Rust clippy (`--all-targets --all-features -- -D warnings`): PASS. Rust `cargo test`: PASS, **53 library tests + 1 binary test passed, 0 failures; 0 doc-test failures**. Coverage includes valid HELLO -> ACCEPT -> close, no sync request, ledger/fingerprint/cursor isolation, one attempt, structured pairing/version/generic rejects, clean EOF/truncated-frame behavior, old schema migration, localhost handshake+sync, and three-node production sync.
- Compatibility remains unchanged: invite canonical bytes length **353**, invite ID `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`; fingerprints remain `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`, `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`, `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`, and `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.
- `git diff --check`: PASS (only existing LF/CRLF working-copy warnings). The worktree remains intentionally uncommitted. The pre-existing `apps/daovibe-android/build.gradle.kts` modification was not touched by this milestone. Helper prompt files remain untouched. No physical-device testing, firewall changes, commit, or push occurred.
- Files changed for this milestone are the Android diagnose/Room/responder/UI and focused test files plus Rust node/storage/transport/CLI and focused tests; no new protocol message file or packet type was introduced. Unresolved issues: none for this milestone.


