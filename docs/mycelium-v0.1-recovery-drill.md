# Mycelium v0.1 Alpha recovery drill

This is a non-destructive verification of ledger portability. Perform it only
with an isolated/test Room or Rust database. Never delete or overwrite a live
database, and do not claim that an export is encrypted.

1. From Android Settings, choose **Export Ledger** and write a new file in a
   test evidence directory. Preserve the original file byte-for-byte.
2. Verify the file exists, is non-empty, and record its byte length and a local
   hash. Do not edit it or include payload bodies in a report.
3. Open an isolated/test database (Android in-memory/temporary Room or a fresh
   Rust `--data-dir`) and import through the existing production import path.
4. Compare source and imported ledgers: packet count; packet IDs; authors;
   canonical packet JSON; and the canonical derived-state JSON/fingerprint.
5. Import the same export a second time. It must be accepted idempotently with
   zero newly inserted packets (duplicates may be reported).
6. Preserve the original export and comparison evidence. Clean up only the
   disposable test environment according to local operator policy.

The semantic ledger is portable because state is deterministically replayed
from canonical packets. Peer registry entries, cursors, health, and Diagnose
metadata are local operational state and are not a portable recovery
credential. Development pairing correlation is not secure recovery material.
Cryptographic key recovery does not exist yet because cryptographic identity
and authenticated transport are explicitly deferred.

