# NEXT TASK

## Mycelium Handshake-Only Diagnose + Connection Protocol Hardening

Implement the currently approved Mycelium milestone:

- real non-ledger-mutating peer Diagnose
- existing handshake only: CONNECTION_HELLO -> CONNECTION_ACCEPT -> clean close
- no SYNC_REQUEST during Diagnose
- exactly one Diagnose attempt
- no packet import/export
- no cursor mutation
- no semantic-state/fingerprint mutation
- dedicated local diagnostic metadata
- Android Diagnose UI
- Rust `peer diagnose <node_id>`
- preserve all existing sync/packet invariants
- no new Mycelium packet types
- no discovery, DHT, gossip, NAT traversal, Compute, EEE, SBP, or People-Owned Cloud
- no cryptographic-authentication work in this milestone
- no physical-device testing
- no firewall changes
- no commit or push

The full implementation and verification requirements are supplied in:

C:\Users\ADMIN\Downloads\mycelium_handshake_only_diagnose_prompt.txt

STOP after this milestone.
