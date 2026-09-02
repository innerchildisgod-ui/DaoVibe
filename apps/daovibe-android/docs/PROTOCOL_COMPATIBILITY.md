# Android Protocol Compatibility

This Android application treats the existing TypeScript DAOVibe/Mycelium
implementation as the behavioral source of truth for the first local core.

## Preserved Behavior

- Packet protocol version remains `lmp/0.1`.
- Canonical JSON follows the TypeScript `stableStringify` behavior:
  object keys are sorted, absent optional fields are omitted, and array order is
  preserved.
- `payload_hash` is SHA-256 of the canonical payload JSON.
- `packet_id` is SHA-256 of the canonical packet hash input without
  `packet_id` or `signature`.
- Development signatures use `dev_signature:<author>:<packet_id>`.
- `dev_signature_placeholder` remains accepted as a legacy development
  placeholder.
- Meaning confidence and latest unique voter counting follow the TypeScript
  `LanguageConfidence` and `MeaningConfidenceLookup` behavior.

## Intentional Android Differences

- Android currently supports only the initial local Mycelium packet subset:
  `phrase_observed`, `meaning_proposal`, `meaning_vote`, and `safety_label`.
- Android performs stricter payload validation for that subset than the current
  TypeScript validator. This prevents the local app from storing malformed
  phrase, meaning, vote, or safety payloads.
- Signature handling is development/placeholder only. Real cryptography and
  Android Keystore integration are intentionally deferred.
- KYC, payments, orders, marketplace, orchestrators, compute, networking, EEE,
  and SBP are intentionally excluded from this Android milestone.

## Replay Rules

The packet ledger is the source of truth. Derived phrase, meaning, vote, and
safety state must be rebuildable from stored packets. Rebuild sorts valid ledger
packets by `created_at` and then `packet_id`, then applies reducers inside a
Room transaction. Packet history is not mutated during rebuild.

This means replay is deterministic for complete causal packet sets. If a ledger
contains a meaning proposal before the phrase it depends on, or a vote before
the meaning it targets, replay rejects that rebuild rather than inventing a
missing ancestor.

