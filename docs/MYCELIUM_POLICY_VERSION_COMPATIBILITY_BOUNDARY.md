# Mycelium Policy Version Compatibility Boundary

Commit 51 defines the Mycelium policy version compatibility boundary.

This document is architecture-only. It does not implement runtime negotiation, sync execution, networking, peer discovery, storage writes, scheduling, cloud sync, mobile app behavior, desktop packaging, or native enforcement.

## Why this boundary exists

Mycelium depends on deterministic derived state.

The rule is not only:

```text
same valid packets = same derived state
