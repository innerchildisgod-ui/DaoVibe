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

# Mycelium Peer Invite Bootstrap Ã¢â‚¬â€ audit and gap repair

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

# Mycelium Handshake-Only Diagnose Ã¢â‚¬â€ completion update

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

---

# Mycelium v0.1 Alpha Readiness + Recovery Hardening

Date: 2026-09-29

- Consistency checks: added read-only Android `MyceliumConsistencyReport` and Rust `mycelium-check` report. Checks cover structural identity, canonical ledger order, packet decode/validation, unique IDs, payload hash, packet ID, current development signatures, dependency-aware replay, canonical fingerprint, and exclusion of peer/Diagnose metadata.
- Mutation boundary: resident Android/Rust stores are never repaired or rewritten by a check. Android uses an isolated in-memory Room database for fresh replay and export/import proof; Rust uses an isolated in-memory SQLite store. Ledger rows, cursors, peer health, sync diagnostics, Diagnose diagnostics, identity, and packets remain unchanged.
- Replay verification: resident canonical reducer output is compared with a fresh dependency-aware ledger replay; mismatches are reported as `resident_state_mismatch`, with `dependency_unresolved`/`replay_failed` categories for replay errors.
- Export/import round-trip: Android proves canonical export -> empty temporary Room import -> rebuild -> canonical JSON/fingerprint. Existing atomic import, idempotent duplicate handling, conflicting duplicate rejection, size/expiry/validation rules remain unchanged. Rust uses its current packet insertion/replay path in an isolated temporary store for equivalent round-trip proof; no incompatible format was added.
- Corruption categories: bounded privacy-safe categories include `identity_missing`, `identity_invalid`, `packet_decode_failed`, `payload_hash_mismatch`, `packet_id_mismatch`, `signature_invalid`, `duplicate_packet_id_conflict`, `dependency_unresolved`, `replay_failed`, `resident_state_mismatch`, `migration_issue`, `export_roundtrip_failed`, and `unknown`.
- Android readiness UI: Device screen now has explicit Ã¢â‚¬Å“Mycelium alpha readinessÃ¢â‚¬Â, status, node ID, packet count, fingerprint, consistency/replay result, peer count, last check time, Run check, and Copy diagnostics. Copy output contains no payloads, secrets, invites, or credentials. No background polling or auto-repair was added.
- Rust CLI: added top-level `mycelium-check`, emitting concise structured JSON without mutating ledger/cursor/peer metadata.
- Room version/migrations: remains Room v7; `MIGRATION_6_7` and the existing v1->v7 chain are unchanged. No new schema change was needed.
- Rust schema changes: none; the existing idempotent compatible SQLite extension remains unchanged.
- Compatibility values remain exact:
  - convergence `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`
  - canonicalization edge `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`
  - correction `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`
  - correction tombstone `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`
  - peer invite canonical bytes `353`; invite ID `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`
- Android tests/build: `testDebugUnitTest` PASS, 190 tests, 0 failures; `assembleDebug` PASS. Added healthy read-only consistency/replay and diagnostics privacy coverage.
- Rust fmt/clippy/tests: `fmt --check` PASS; clippy `--all-targets --all-features -- -D warnings` PASS; `cargo test` PASS, 54 library tests + 1 binary test, 0 failures, 0 doc-test failures.
- Localhost sync: existing localhost sync regression remains green.
- Diagnose: existing handshake-only Diagnose regression remains green and is excluded from semantic fingerprints/readiness payloads.
- Three-node sync: existing production three-node convergence regression remains green.
- `git diff --check`: PASS; only existing LF/CRLF working-copy warnings.
- Build file untouched: `apps/daovibe-android/build.gradle.kts` remains the pre-existing user modification and was not touched.
- Physical testing: no.
- Firewall changes: no.
- Commit/push: no.
- Unresolved issues: none for this milestone. Alpha readiness is local-only and explicitly does not claim secure authentication, production readiness, discovery, Byzantine tolerance, censorship resistance, or cloud replacement.

---

# Mycelium v0.1 Alpha Readiness Ã¢â‚¬â€ correctness/audit repair pass

Date: 2026-09-29

This pass did not restart or expand the milestone. It corrected the review gaps in the existing consistency/readiness implementation.

## Problems found and repairs

1. Rust compared `from_packets(packets.clone())` with the same call, so the resident/fresh check was tautological. The resident side now uses the production `MyceliumStateSnapshot::from_store(&store)` path. The fresh side independently reads raw persisted packet rows, validates/decodes them, and replays that independently loaded list. Canonical JSON and fingerprint are both compared.
2. Rust labels no longer imply validation without doing it. Every stored row is revalidated through the existing `Packet::from_json`/`Packet::validate` path used by normal storage/import logic. This checks canonical decode, payload hash, packet ID, required/expiry structure, and the current development signature rule. Raw row ID is compared with decoded packet ID; non-canonical stored JSON is rejected. Failures map to `packet_decode_failed`, `payload_hash_mismatch`, `packet_id_mismatch`, `signature_invalid`, `duplicate_packet_id_conflict`, `dependency_unresolved`, `replay_failed`, or `unknown`. Existing rows with past expiry remain historical ledger input; expiry is structurally validated, while import-time expiry rejection remains in the normal import path.
3. SQLite `packets.packet_id` is a primary key, so duplicate physical rows are schema-impossible. A focused test proves that boundary. The checker still detects conflicting/ambiguous representations if corruption is introduced through a tampered row or mismatched stored ID; it does not pretend the schema can contain two rows with the same primary key.
4. Android readiness failure fallback now uses only the bounded stable code `unknown`; raw exception text is never placed in copied readiness diagnostics. The fingerprint display fallback is also reduced to `replay_failed` rather than exposing exception text. A focused test proves fake secret/path/SQL text cannot appear in copied diagnostics.
5. Readiness fields no longer claim unverified runtime facts. `database_open=true` means the explicit check is executing against an already-open Room database. `migration_chain_ok=current_schema_open` means only that current-schema access succeeded; it does not claim every historical migration was runtime-tested. Fixture fields are `test_suite_verified`, not hardcoded booleans: fixture execution remains owned by the existing compatibility tests and is not duplicated in production code. `identity_persistent` reports `identity_present_in_persistent_row` (or `missing`), meaning the identity was loaded from the persistent Room row, not that a write/persistence cycle was performed. Overall readiness is based on actual consistency/replay results, not fabricated fixture booleans.

## Proof coverage

- Android readiness round-trip now checks packet count, packet IDs, authors, canonical packet JSON, canonical derived state JSON, fingerprint, and a second import with zero new inserts. Existing `LocalMyceliumRepository.importLedgerJson` tests continue to prove deterministic conflicting-duplicate rejection and idempotence.
- Rust round-trip uses the current packet canonical JSON/insertion path into a fresh in-memory `Store`, compares canonical state and fingerprint, and verifies the second insertion is idempotent. No new wire/export format was introduced.
- Android and Rust read-only tests snapshot the packet ledger, sync cursor/state, sync success/failure timestamps, sync outcome/stage/category, imported/duplicate/exported counts, Diagnose timestamp/outcome/stage/category/message/latency, known-peer metadata, identity, and semantic fingerprint. After consistency/readiness, all snapshots remain equal. Rust additionally proves the SQLite primary-key duplicate boundary and revalidation of a tampered payload hash.

## Compatibility and scope

- Room remains version 7; no schema change was made.
- Rust SQLite schema is unchanged.
- Convergence fingerprint: `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`
- Canonicalization edge fingerprint: `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`
- Correction fingerprint: `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`
- Correction tombstone fingerprint: `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`
- Peer invite canonical bytes: `353`
- Peer invite ID: `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`

## Verification results

- Android `testDebugUnitTest --no-daemon --console=plain`: PASS, **191 tests, 0 failures**.
- Android `assembleDebug --no-daemon --console=plain`: PASS.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu fmt --check`: PASS.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu clippy --all-targets --all-features -- -D warnings`: PASS.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu test`: PASS, **56 library tests + 1 binary test, 0 failures; 0 doc-test failures**.
- Localhost sync regression: PASS (`node::tests::localhost_listener_accepts_handshake_and_sync_request`).
- Diagnose regression: PASS (`node::tests::diagnose_is_one_handshake_only_and_preserves_ledger_state`, plus structured reject coverage).
- Three-node regression: PASS (`node::tests::three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing`).
- Root `git diff --check`: PASS; only existing LF/CRLF working-copy warnings.
- `git status --short`: expected uncommitted milestone/audit files plus the pre-existing build-file and helper/prompt files; no reset/clean/revert/checkout/stash was used.

`apps/daovibe-android/build.gradle.kts` remains the pre-existing modification and was untouched. No physical-device testing was performed. No firewall or network configuration was changed. No commit or push was performed. No node identities or compatibility fixtures were changed.

Unresolved issues: none for this focused audit/repair pass. The readiness check remains local-only and does not claim secure authentication, discovery, Byzantine tolerance, or production deployment readiness.

---

# Mycelium v0.1 Alpha Acceptance & Release Readiness

Date: 2026-09-30

## Release contract

Created `docs/mycelium-v0.1-alpha.md`. The contract is local-first Mycelium
semantic ledger only: Android light node, Rust desktop/heavy node, manual peers,
development pairing correlation, bounded packet sync, deterministic convergence,
canonical export/import, diagnostics, and a local alpha-readiness check. It
explicitly excludes cryptographic authentication, encrypted transport guarantees,
DHT/discovery, NAT traversal, Bluetooth/Wi-Fi Direct/hotspot mesh, anonymous
identity, distributed cloud, compute/WASM, EEE, SBP, orchestrators, service
modules, and production security certification. Pairing/invites remain
development correlation only.

## Files created/changed

Created:

- `docs/mycelium-v0.1-alpha.md`
- `docs/mycelium-v0.1-physical-acceptance.md`
- `docs/mycelium-v0.1-operator-guide.md`
- `docs/mycelium-v0.1-recovery-drill.md`
- `docs/mycelium-v0.1-artifacts.md`
- `apps/daovibe-desktop-node/src/release.rs`

Changed release/readiness code and tests:

- Android app version metadata, Room schema constant, readiness diagnostics,
  failure diagnostics construction, and two high-level acceptance tests.
- Rust package/Cargo lock version, consistency report metadata, release blocker
  model, and two high-level acceptance tests.
- `.daovibe/tasks/NEXT_TASK.md` now names the next milestone exactly as
  `Mycelium v0.2 â€” Cryptographic Identity & Authenticated Transport Design`
  and records the plan-only topics: asymmetric node identity, signed packets,
  authenticated handshake, encrypted transport, key persistence/recovery,
  migration compatibility, and threat model.

The pre-existing `apps/daovibe-android/build.gradle.kts` working-tree change was
not touched (initial and final SHA-256:
`A7C977BDEAD4CE0BD3EE061BB8651719D19D74D99F6E4F4CE438CCF9DBEAB932`). Helper
prompt files were not touched.

## Release diagnostics behavior

Android reuses the existing read-only consistency/readiness checker. Copied
readiness diagnostics now include exactly: `app_package`, `app_version_name`,
`app_version_code`, `room_schema_version`, readiness `status`, `checked_at`,
`node_id_present`, `database_open`, `migration_chain_ok`, `ledger_consistency`,
`replay_consistency`, `canonical_fingerprint`, `packet_count`, `peer_count`,
`identity_persistent`, `export_import_roundtrip_tested`,
`semantic_fixture_compatibility`, `invite_fixture_compatibility`, and bounded
`warnings`. Rust `mycelium-check` includes `package_version`,
`schema_compatibility`, `status`, `checked_at`, `node_id`,
`ledger_packet_count`, `derived_phrase_count`, `canonical_fingerprint`,
`issues`, and `checks_performed`.

Diagnostics exclude packet payload bodies, pairing secrets/PINs, invite payloads,
filesystem secrets, and raw exception text. Peer/Diagnose metadata remains
excluded from semantic fingerprints. No redundant readiness system was added.

## Acceptance and recovery documentation

The physical checklist covers identity persistence/distinct IDs, handshake-only
Diagnose invariants, AndroidÃ¢â€ â€desktop sync in both directions, restart
persistence, repeated-sync idempotence, isolated export/import recovery,
AÃ¢â€ â€BÃ¢â€ â€C propagation, and unreachable/wrong-correlation/protocol-mismatch cases.
It is human execution only; no physical testing was performed.

The operator guide was checked against the current Clap definitions for build,
listener, identity/state/state-hash, ledger status, `mycelium-check`, peer
list/add/remove/sync/sync-all/diagnose, invite and pairing commands, and Android
build/APK paths. The recovery drill requires preserving the original export,
non-empty verification, isolated import, packet count/ID/author/canonical JSON/
fingerprint comparison, and a repeated idempotent import; it never deletes the
live database and makes no backup-encryption claim.

## Artifact inventory and metadata

- Android package: `org.daovibe.android`.
- Android version: `0.1-alpha`, version code `1`.
- Android APK: `apps/daovibe-android/app/build/outputs/apk/debug/app-debug.apk`
  (present; output metadata reports the same package/version/code).
- Rust package/CLI: `0.1.0-alpha`; `daovibe-desktop --version` reports
  `daovibe-desktop 0.1.0-alpha`.
- Rust debug binary:
  `apps/daovibe-desktop-node/target/debug/daovibe-desktop.exe` (present).
- Optional release binary path is documented but was not built.
- Compatibility fixtures remain under
  `apps/daovibe-android/app/src/test/resources/fixtures/` and
  `protocol-fixtures/`; no APK/EXE was added to Git.

## Release blocker model

`release::evaluate_alpha_release` is deterministic and test-covered. Fail/pass
blockers are build failure, test failure, consistency failure, fingerprint
compatibility regression, invite compatibility regression, migration/schema
incompatibility, and privacy leak in diagnostics. Explicit warning entries are
no cryptographic auth, manual peer configuration, no discovery, and development
pairing only. The model does not call the release secure.

## Verification

- Room version: **7**; no Room migration was added.
- Rust schema: no schema changes; existing idempotent SQLite layout, reported as
  `idempotent_sqlite_current_layout`.
- Compatibility fingerprints unchanged: convergence
  `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`,
  canonicalization edge
  `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`,
  correction
  `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`,
  correction tombstone
  `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.
- Peer invite canonical bytes: **353**; invite ID:
  `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`.
- Android high-level acceptance: production phrase/meaning creation, export,
  isolated Room import, readiness/fingerprint verification, and target identity
  preservation; **192 tests, 0 failures**, including the named alpha acceptance
  checks.
- Android `testDebugUnitTest --no-daemon --console=plain`: **PASS**.
- Android `assembleDebug --no-daemon --console=plain`: **PASS**.
- Rust high-level acceptance: production `insert_packet` copy into an isolated
  second Store, readiness/fingerprint comparison; **58 library tests + 1 binary
  test passed, 0 failures, 0 doc-test failures**.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu fmt --check`: **PASS**.
- Rust clippy (`--all-targets --all-features -- -D warnings`): **PASS**.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu test`: **PASS**.
- Rust `cargo +1.90.0-x86_64-pc-windows-gnu build`: **PASS**.
- Localhost sync regression: **PASS** (`localhost_listener_accepts_handshake_and_sync_request`).
- Diagnose regression: **PASS** (`diagnose_is_one_handshake_only_and_preserves_ledger_state`, plus structured rejects).
- Three-node production sync regression: **PASS** (`three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing`).
- `git diff --check`: **PASS** (only existing LF/CRLF working-copy warnings).
- Git status: branch `android-rebuild` at `f638b11`, tracking local
  `origin/android-rebuild`; expected uncommitted release/docs/code changes, the
  protected pre-existing Gradle edit, and existing helper prompt files remain.

Physical testing: **no**. Firewall changes: **no**. Commit/push/tag: **no**.
Unresolved issues: none for this alpha-readiness milestone; Android compiler
emits only existing API-deprecation warnings for the pre-28 versionCode fallback.

The worktree remains intentionally uncommitted.

# Mycelium v0.2 Cryptographic Identity & Authenticated Transport Design

Date: 2026-09-30. Design-only handoff; source, wire behavior, fixtures, and
schemas were not changed.

## Current security audit

- Android `LmpPacket`/Rust `Packet` fields are `version`, `packet_id`,
  `packet_type`, `created_at`, optional `expires_at`, `zone`, `author`, optional
  `parent`, `payload_hash`, `payload`, and `signature`.
- `payload_hash` is SHA-256 of canonical payload JSON.
- Canonical JSON is compact UTF-8 with lexicographically sorted object keys,
  insertion-preserving arrays, JSON escaping, and Kotlin/Rust-matched decimal
  number normalization; optional null fields are omitted by the packet maps
  before hashing.
- `packet_id` is SHA-256 of canonical JSON containing version, packet type,
  created/expires timestamps, zone, author, parent, payload hash, and payload;
  signature is excluded from this preimage.
- Canonical packet JSON includes the signature field. The current signature
  input is canonical JSON of version, packet ID, packet type, created/expires
  timestamps, zone, author, parent, and payload hash; its diagnostic hash is
  exposed, but the current value is a development string.
- Android accepts the exact `dev_signature:<author>:<packet_id>` form (and a
  legacy placeholder status); Rust currently requires that development form.
  The current dev signature cryptographically protects nothing: it is only a
  deterministic string containing author and packet ID (the validator also
  recomputes the unsigned packet hash/signature-input diagnostic). It is not
  proof of key possession and must not be treated as such.
- `pairing_id` is derived from `daovibe-pairing-v1|source_node_id|created_at|challenge`
  and is development correlation only. The v1 invite is bootstrap/configuration
  data, not proof of identity.
- Current connection fields are `daovibe-connection-v1`, `session_id`, source /
  target node IDs, platform/role, pairing ID, timestamps, supported connection
  and packet versions, capabilities, negotiated versions, state, and reject
  reason. HELLO/ACCEPT validates structure/pairing/version correlation only;
  TCP uses a bounded 4-byte big-endian length prefix and is not guaranteed
  encrypted or MITM-resistant. Successful Diagnose proves compatibility, not
  authentic identity.
- Persisted peer fields are endpoint, pairing ID, display name, bounded sync and
  Diagnose outcome/error metadata; no public-key pin exists today. Android
  Room is v7. Rust SQLite has `device_identity`, `packets`, `paired_devices`,
  `peer_sync_state`, and `known_peers` with additive diagnostic columns.
- Android creates a node ID as `mycelium_node_` plus 16 hex characters from a
  UUID; Rust creates an immutable `mycelium_node_` plus a 32-hex SHA-256 prefix
  over desktop/time/process/current-directory inputs. v0.2 binds these existing
  values and never derives or replaces them from a public key.
- Historical packet IDs/authors, canonical JSON, correction/tombstone semantics,
  packet-ledger source of truth, export/import, and peer/Diagnose exclusion from
  semantic fingerprints are safe extension boundaries. Adding authenticated
  behavior to the existing signature field is a future protocol change; changing
  packet-ID inputs or historical versions is prohibited.

## v0.2 design decisions

- Identity: Ed25519 long-term signing key; raw 32-byte public key as unpadded
  base64url; SHA-256 public-key fingerprint as 64 lowercase hex characters,
  displayed in four-character groups. The immutable random `node_id` remains
  unchanged and is bound to exactly one current public key record.
- Trust: `legacy_unverified`, `pending_verification`, `trusted`, `key_changed`,
  and `revoked` (plus local `uninitialized`/`unavailable` lifecycle states).
  Same node ID with an unexpected key is never auto-trusted. First contact needs
  explicit approval and preferably out-of-band fingerprint comparison.
- Packet signatures: retain historical v0.1 bytes/IDs. A new signature envelope
  in the existing signature field carries explicit scheme/version/fingerprint
  and an Ed25519 signature over UTF-8
  `daovibe/mycelium/packet-signature/v2\0` followed by canonical JSON of
  `{signature_version, signature_scheme, key_fingerprint, packet_input}`,
  where `packet_input` is the existing signature-input fields (excluding the
  signature itself). New packets encode it as
  `ed25519:v2:<fingerprint>:<unpadded-base64url-signature>`;
  authenticate authorship; imported
  historical packets retain legacy status; new packets from legacy nodes are
  policy-rejected or remain explicitly unverified until migration. A packet
  version bump is only needed if this envelope cannot be implemented safely.
- Transport: Noise XX with a standard 25519/ChaChaPoly/SHA-256 suite, with
  separate Ed25519 identity signatures binding node IDs, public keys, complete
  Noise transcript, negotiated versions, and capabilities. Noise derives
  per-direction AEAD keys. Encrypted frames retain bounded framing and add
  direction-local monotonic counters, authenticated headers, replay/nonce
  checks, clean close, and bounded rekey/session lifetime.
- v2 uses `daovibe-connection-v2`; version selection, complete advertised sets,
  packet protocol, node IDs, fingerprints, and capabilities are transcript-bound.
  Pinned peers reject downgrade and never silently fall back to v1. v1 remains
  an explicit legacy migration path only.
- Authenticated Diagnose performs AKE and peer confirmation, then clean close;
  it performs no packet import, cursor update, or semantic-state mutation.
- Invite v2 adds source node ID, identity public key, fingerprint, host/port,
  connection and packet versions, expiry, capabilities, and an optional
  signature. A signature proves control of the key, not real-world identity;
  out-of-band verification is still required. Invite v1 remains parseable as
  `legacy_unverified`.

## Storage, rotation, and migration

- Android minSdk is 26 with no current crypto dependency. Prefer Android
  Keystore and hardware-backed protection where the provider supports Ed25519;
  provider/API-26 capability must be spiked, with a vetted encrypted fallback.
  UI may show public key/fingerprint and hardware-backed status; private keys
  never appear in diagnostics.
- Rust/Windows currently stores `data_dir/daovibe.sqlite3` and has no key store.
  Future key material should use OS-protected wrapping (DPAPI/CNG where
  appropriate) or an audited encrypted-file/passphrase alternative; ACLs alone
  are not hardware security. Database/key mismatch fails closed.
- Proposed next Android schema is Room v8: nullable identity public key,
  fingerprint, scheme, creation time, and state; known-peer pinned key,
  fingerprint, trust state, first/last verification and key-change timestamps.
  Existing rows default to legacy/uninitialized states; no migration was added
  now. Rust should add equivalent nullable columns using an explicit future
  additive migration/user-version step while preserving old databases.
- Rotation is authorized by an old-key signature over node ID, old/new
  fingerprints, scheme, and creation time. Without the old key, explicit local
  recovery plus out-of-band peer re-verification is required. Lost device,
  reinstall, database-only restore, and key-only restore never auto-replace a
  key or seize a node ID.

## Diagnostics and vectors

Future bounded categories include `identity_key_missing`,
`identity_key_unavailable`, `peer_key_unpinned`, `peer_key_changed`,
`peer_signature_invalid`, `packet_signature_invalid`,
`handshake_auth_failed`, `handshake_transcript_invalid`, `protocol_downgrade`,
`replay_detected`, `decrypt_failed`, `nonce_or_counter_invalid`,
`unsupported_crypto_suite`, `legacy_peer_disallowed`, and
`key_rotation_unverified`. Never emit private keys, raw session keys, plaintext
packet bodies, pairing/recovery secrets, or raw crypto exceptions; fingerprints
are safe to show.

Vectors cover public-key encoding/fingerprint, packet preimage/signature,
handshake transcript, version negotiation/downgrade, key mismatch, replay,
encrypted frame, and old-key rotation authorization. Deterministic vectors are
shared fixtures; ephemeral Noise/rekey/three-node tests are randomized
integration tests. No production private keys are generated in this milestone.

## Phased plan and status

The full phased plan is in `docs/mycelium-v0.2-implementation-plan.md`:
v0.2A identity foundation; v0.2B packet signatures; v0.2C authenticated
encrypted handshake; v0.2D migration/rotation/recovery; v0.2E physical security
acceptance. ADR: `docs/adr/ADR-0001-mycelium-v0.2-cryptographic-identity-and-transport.md`.
Threat model: `docs/mycelium-v0.2-threat-model.md`. Transport:
`docs/mycelium-v0.2-authenticated-transport.md`. Key storage:
`docs/mycelium-v0.2-key-storage.md`. Vectors:
`docs/mycelium-v0.2-crypto-test-vectors.md`.

- v0.1 fingerprints unchanged: convergence
  `aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0`,
  canonicalization edge `7b99d4871b0dc2460aa567e2d9c2a735102a316eb4191793fe635144cb9cc2ab`,
  correction `455eb3d58a0527a45caf6196bb5dbcf9a40a697f7529acad973bdeb3ed3fbb6f`,
  correction tombstone `82697458c19018e54ff8e0aa22f4ce7dc4f701c1b4598772e94797b16eba1a52`.
- v0.1 peer invite canonical bytes remain `353`; invite ID remains
  `957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9`.
- Source/protocol implementation: **no**. Schema migration: **no**. Physical
  testing: **no**. Firewall changes: **no**. Commit/push/tag: **no**.
- Unresolved questions are the exact audited Android API-26 provider/fallback,
  cross-platform Noise library choices, Windows key-protection API, and final
  binary ciphertext-frame encoding; these are implementation spikes, not reasons
  to alter v0.1 now.

Next task is exactly `Mycelium v0.2A — Cryptographic Node Identity Foundation`
in `.daovibe/tasks/NEXT_TASK.md`; do not begin it in this design run.
