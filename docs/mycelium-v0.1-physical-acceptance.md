# Mycelium v0.1 Alpha physical acceptance checklist

Human execution only. Codex must not automate taps, swipes, typing, phone
setup, or physical-device testing. Use a disposable test environment for
recovery work and preserve the live databases.

## Prerequisites

- One Android device and one Windows desktop, both running the same documented
  alpha build identity.
- A second Android or desktop node for the three-node A-B-C case.
- USB debugging/ADB only if the operator already uses it; no firewall changes
  are part of this checklist.
- A clean test directory and an evidence folder. Record timestamps, node IDs,
  command output, screenshots, and exported-file hashes without recording
  secrets or packet payload bodies.

## Checks

| Action | Expected result | Evidence to capture |
| --- | --- | --- |
| Open Device/Identity on each node and restart each app/node. | Each node keeps its own non-blank ID; restart does not change it. | IDs before/after, app version, timestamps. |
| Run handshake-only Diagnose from the Android Network screen and Rust `peer diagnose <node_id>`. | One HELLO/ACCEPT exchange and clean close; no `SYNC_REQUEST`, packet import/export, cursor change, or fingerprint change. | Diagnose result, before/after packet count, cursor, fingerprint. |
| Create valid phrase/meaning data on Android and run Android-to-desktop sync. | Desktop imports bounded valid packets with original IDs/authors and converges to the Android fingerprint. | Both `mycelium-check` reports and fingerprints. |
| Create valid data on desktop and run desktop-to-Android sync. | Android imports and derives the same canonical state; no node identity replacement. | Android readiness diagnostics and desktop state hash. |
| Restart both nodes, then repeat the sync. | Identity, ledger, cursor, and fingerprint persist; repeated sync imports zero new packets or only reports duplicates. | Restart timestamps, sync result, counts/cursor. |
| Export the canonical ledger from Settings > Export Ledger; run the recovery drill in an isolated test database. | Import is atomic and idempotent; packet IDs/authors/canonical JSON and fingerprint match. | Original export preserved, file size/hash, comparison report. |
| Configure only A-B and B-C, seed data on A, sync A↔B then B↔C. | C receives ordinary packets through B; A/B/C converge without a direct A-C peer. | Peer lists, sync outputs, packet IDs/authors, three fingerprints. |
| Stop or make a peer endpoint unreachable and run Sync/Diagnose. | Bounded failure with a category and no ledger, cursor, or fingerprint corruption. | Failure category, before/after state diagnostics. |
| Use a wrong development pairing correlation in an isolated test. | Connection is rejected as pairing mismatch; no packets or cursors change. | Reject/diagnose category and unchanged state evidence. |
| If a safely controlled version mismatch fixture is available, try it. | Rejection is classified as protocol mismatch; no state mutation. Do not alter production data. | Fixture, category, unchanged state evidence. |

Do not interpret a successful pairing, Diagnose, or sync as authenticated,
encrypted, proof-of-possession, or MITM-resistant communication.

