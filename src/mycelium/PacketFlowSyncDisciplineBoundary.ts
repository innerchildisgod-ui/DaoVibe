/**
 * DAOVibe / Mycelium packet flow sync discipline boundary.
 *
 * Architecture-only.
 *
 * This boundary defines the rule that packets entering and leaving Mycelium
 * should move through disciplined sync mechanics:
 *
 * - small packet deltas
 * - bounded packet windows
 * - cursors
 * - compact summaries
 * - phone-safe packet flow
 * - laptop/desktop review for larger windows
 *
 * This file does not run sync, send packets, receive packets, discover peers,
 * perform networking, write storage, schedule work, use cloud sync, implement
 * mobile behavior, implement desktop packaging, or enforce native rules.
 *
 * The packet ledger remains the source of truth.
 */

export type MyceliumPacketFlowSyncRuntimeStatus = "architecture_only";

export type MyceliumPacketFlowDirection =
  | "incoming"
  | "outgoing"
  | "bidirectional";

export type MyceliumPacketFlowSizeClass =
  | "tiny_delta"
  | "small_delta"
  | "bounded_window"
  | "compact_summary"
  | "must_split"
  | "must_defer_to_laptop_desktop";

export type MyceliumPacketFlowDisciplineArea =
  | "outgoing_packet_delta"
  | "incoming_packet_delta"
  | "cursor_based_resume"
  | "bounded_packet_window"
  | "compact_sync_summary"
  | "phone_safe_flow"
  | "laptop_desktop_window_review"
  | "no_repeated_unchanged_state"
  | "large_payload_split"
  | "flow_speed_protection";

export interface MyceliumPacketFlowSyncDisciplineRule {
  readonly area: MyceliumPacketFlowDisciplineArea;
  readonly direction: MyceliumPacketFlowDirection;
  readonly preferredSizeClass: MyceliumPacketFlowSizeClass;
  readonly purpose: string;
  readonly allowedFlow: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly phoneConstraint: readonly string[];
  readonly laptopDesktopResponsibility: readonly string[];
  readonly speedReason: string;
  readonly ledgerRule: string;
  readonly cursorRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumPacketFlowSyncRuntimeStatus;
}

export const MYCELIUM_PACKET_FLOW_SYNC_DISCIPLINE_CORE_RULES = [
  "Packets entering Mycelium should arrive through bounded sync mechanics.",
  "Packets leaving Mycelium should leave as small deltas, bounded windows, or compact summaries.",
  "Packet flow should rely on cursors and sync windows instead of broad repeated broadcast.",
  "Large payloads should be split, summarized, deferred, or reviewed by laptop/desktop peers.",
  "Phones are real bounded peers and should receive phone-safe packet windows.",
  "Laptops/desktops are preferred for larger packet-window review, diagnostics, reconciliation, export/import review, and repair planning.",
  "Repeated unchanged state must not be transmitted.",
  "The packet ledger remains the source of truth.",
  "Same valid packets plus compatible policy rules must derive the same state.",
  "Critical packet-flow enforcement should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_PACKET_FLOW_SYNC_DISCIPLINE_BOUNDARY: readonly MyceliumPacketFlowSyncDisciplineRule[] =
  [
    {
      area: "outgoing_packet_delta",
      direction: "outgoing",
      preferredSizeClass: "small_delta",
      purpose:
        "Keeps packets leaving a Mycelium node small, specific, and sync-driven instead of allowing broad packet floods.",
      allowedFlow: [
        "new packet delta",
        "bounded outgoing event",
        "small correction or tombstone delta",
        "cursor-aware packet response",
      ],
      mustAvoid: [
        "large unbounded packet broadcast",
        "repeated unchanged derived state",
        "sending full local state by default",
        "gossip-style packet flooding",
      ],
      phoneConstraint: [
        "phone may send small outgoing change events",
        "phone should queue bounded deltas when offline",
        "phone should avoid large outgoing batches by default",
      ],
      laptopDesktopResponsibility: [
        "review larger outgoing packet windows",
        "prepare compact outgoing summaries",
        "split large packet windows into smaller deltas",
      ],
      speedReason:
        "Small outgoing deltas reduce network load, battery cost, and reconciliation time.",
      ledgerRule:
        "Outgoing packet flow must remain traceable to valid packet-ledger events.",
      cursorRule:
        "Outgoing flow should respect receiver cursors where known.",
      deltaOnlyRule:
        "Outgoing sync should send what changed, not repeated unchanged state.",
      deterministicStateRule:
        "Outgoing deltas should help peers reach the same packet-derived state.",
      futureNativeBoundary:
        "Outgoing packet admission and size control should eventually move behind Rust/WASM/native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "incoming_packet_delta",
      direction: "incoming",
      preferredSizeClass: "small_delta",
      purpose:
        "Keeps packets entering a Mycelium node bounded and validation-friendly.",
      allowedFlow: [
        "small packet delta",
        "bounded correction delta",
        "bounded tombstone delta",
        "bounded identity or settings delta",
      ],
      mustAvoid: [
        "accepting unbounded packet floods",
        "accepting large imports without review",
        "deriving state from invalid packets",
        "treating incoming payload as trusted without packet validation",
      ],
      phoneConstraint: [
        "phone may accept bounded incoming deltas",
        "phone should reject or defer oversized incoming batches",
        "phone should avoid full ledger replay by default",
      ],
      laptopDesktopResponsibility: [
        "review larger incoming packet windows",
        "validate bulk imports",
        "prepare phone-safe packet deltas",
      ],
      speedReason:
        "Bounded incoming deltas allow fast validation and reduce device stall risk.",
      ledgerRule:
        "Incoming packets must become useful only through valid packet-ledger acceptance.",
      cursorRule:
        "Incoming packets should be associated with a cursor/window where possible.",
      deltaOnlyRule:
        "Incoming sync should prefer changed packets and compact summaries over full-state replacement.",
      deterministicStateRule:
        "Accepted incoming deltas should derive the same state under compatible policy rules.",
      futureNativeBoundary:
        "Incoming packet validation and size limits should eventually move behind native packet-flow boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "cursor_based_resume",
      direction: "bidirectional",
      preferredSizeClass: "compact_summary",
      purpose:
        "Uses cursors so devices resume sync from known boundaries instead of resending everything.",
      allowedFlow: [
        "last-seen cursor",
        "safe resume hint",
        "cursor gap summary",
        "bounded repair-window request",
      ],
      mustAvoid: [
        "treating cursor as source truth",
        "resending full state because a cursor exists",
        "hiding cursor gaps",
      ],
      phoneConstraint: [
        "phone should resume using bounded cursors",
        "phone may request small repair windows",
        "phone should defer large cursor-gap review",
      ],
      laptopDesktopResponsibility: [
        "audit cursor gaps",
        "compare larger packet windows",
        "prepare safe cursor repair summaries",
      ],
      speedReason:
        "Cursor resume prevents repeated unchanged packet transfer and makes sync faster.",
      ledgerRule:
        "Cursor decisions must resolve against packet-ledger evidence.",
      cursorRule:
        "A cursor is a resume boundary, not an authority over truth.",
      deltaOnlyRule:
        "Cursor sync should ask for what changed after the cursor.",
      deterministicStateRule:
        "Cursor repair should help devices converge to the same packet-derived state.",
      futureNativeBoundary:
        "Cursor safety should eventually move behind Rust/WASM/native sync validation.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "bounded_packet_window",
      direction: "bidirectional",
      preferredSizeClass: "bounded_window",
      purpose:
        "Defines packet windows as manageable chunks instead of unlimited sync payloads.",
      allowedFlow: [
        "bounded packet range",
        "bounded missing packet window",
        "bounded tombstone window",
        "bounded correction window",
      ],
      mustAvoid: [
        "unbounded packet windows",
        "full ledger dump by default",
        "large phone-side sync windows",
        "window sizes that block fast local use",
      ],
      phoneConstraint: [
        "phone may consume bounded packet windows",
        "phone should defer large windows",
        "phone should preserve offline usability",
      ],
      laptopDesktopResponsibility: [
        "review larger windows",
        "split large windows",
        "prepare compact window summaries",
      ],
      speedReason:
        "Bounded windows keep packet movement predictable and prevent slow sync stalls.",
      ledgerRule:
        "Packet windows are bounded views over the packet ledger, not alternate ledgers.",
      cursorRule:
        "Packet windows should be anchored by clear cursor or range metadata.",
      deltaOnlyRule:
        "Windows should contain needed deltas, not repeated unchanged derived state.",
      deterministicStateRule:
        "The same valid packet window under compatible policy should derive the same result.",
      futureNativeBoundary:
        "Packet window sizing and validation should eventually move behind native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "compact_sync_summary",
      direction: "bidirectional",
      preferredSizeClass: "compact_summary",
      purpose:
        "Allows devices to exchange compact summaries before deciding whether packet deltas are needed.",
      allowedFlow: [
        "packet count summary",
        "cursor summary",
        "missing range summary",
        "diagnostics summary",
        "policy compatibility summary",
      ],
      mustAvoid: [
        "summary pretending to be ledger truth",
        "full diagnostics dump by default",
        "repeated unchanged summary broadcast",
      ],
      phoneConstraint: [
        "phone may exchange lightweight summaries",
        "phone should avoid full diagnostic dumps",
        "phone may use summaries to request bounded deltas",
      ],
      laptopDesktopResponsibility: [
        "prepare deeper summaries",
        "compare larger summaries",
        "turn summary mismatch into bounded packet requests",
      ],
      speedReason:
        "Compact summaries let devices detect whether sync is needed before moving larger packet windows.",
      ledgerRule:
        "Summaries may describe ledger-derived state but must not replace packet-ledger truth.",
      cursorRule:
        "Summaries should include cursor or window context where useful.",
      deltaOnlyRule:
        "Summaries should help choose the smallest necessary delta.",
      deterministicStateRule:
        "Summary mismatch should be explainable through packet, cursor, or policy differences.",
      futureNativeBoundary:
        "Summary integrity checks should eventually move behind native diagnostics/sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "phone_safe_flow",
      direction: "bidirectional",
      preferredSizeClass: "small_delta",
      purpose:
        "Keeps packet flow safe for phones while preserving phones as real peers.",
      allowedFlow: [
        "small incoming packet delta",
        "small outgoing packet delta",
        "bounded sync window",
        "compact local summary",
        "queued offline event",
      ],
      mustAvoid: [
        "phone as unlimited sync node",
        "phone as thin client",
        "large phone imports by default",
        "always-on phone packet broadcast",
      ],
      phoneConstraint: [
        "phone should stay battery-aware",
        "phone should stay storage-bounded",
        "phone should stay background-execution safe",
        "phone should use cursors and bounded deltas",
      ],
      laptopDesktopResponsibility: [
        "absorb heavy sync work",
        "prepare smaller phone-safe windows",
        "run larger diagnostics and reconciliation",
      ],
      speedReason:
        "Phone-safe packet flow keeps mobile sync fast and avoids battery, heat, storage, and app-store problems.",
      ledgerRule:
        "Phone constraints may defer packet movement but must not change ledger truth.",
      cursorRule:
        "Phones should resume from cursors instead of requiring full replay.",
      deltaOnlyRule:
        "Phones should receive and send small deltas wherever possible.",
      deterministicStateRule:
        "Phones should converge using valid bounded deltas and compatible policy rules.",
      futureNativeBoundary:
        "Phone-safe packet flow should eventually be enforced by platform/native sync policy.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "laptop_desktop_window_review",
      direction: "bidirectional",
      preferredSizeClass: "bounded_window",
      purpose:
        "Uses laptops/desktops for larger packet-window review without making them central servers.",
      allowedFlow: [
        "larger packet-window review",
        "bulk validation summary",
        "repair planning summary",
        "phone-safe delta preparation",
      ],
      mustAvoid: [
        "laptop/desktop as source of truth",
        "desktop-only ownership",
        "cloud-style central authority",
        "full-state push to phones",
      ],
      phoneConstraint: [
        "phone may consume prepared bounded deltas",
        "phone should not depend on laptop/desktop as truth owner",
      ],
      laptopDesktopResponsibility: [
        "review larger packet windows",
        "split large flows into smaller deltas",
        "prepare summaries and repair hints",
        "preserve packet-ledger evidence",
      ],
      speedReason:
        "Laptops/desktops can reduce phone workload by turning heavy review into small phone-safe deltas.",
      ledgerRule:
        "Laptop/desktop review must remain grounded in packet-ledger truth.",
      cursorRule:
        "Reviewed windows should produce cursor-aware outputs.",
      deltaOnlyRule:
        "Laptop/desktop outputs should be bounded deltas or summaries, not repeated full state.",
      deterministicStateRule:
        "Prepared outputs should move devices toward the same packet-derived state.",
      futureNativeBoundary:
        "Large-window review and delta preparation should eventually move behind Rust/WASM/native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "no_repeated_unchanged_state",
      direction: "bidirectional",
      preferredSizeClass: "tiny_delta",
      purpose:
        "Makes repeated unchanged state transmission explicitly forbidden as a normal sync strategy.",
      allowedFlow: [
        "change event",
        "delta packet",
        "cursor update",
        "compact mismatch summary",
      ],
      mustAvoid: [
        "repeated unchanged phrase state",
        "repeated unchanged meaning state",
        "repeated unchanged correction state",
        "repeated unchanged settings state",
        "full-state broadcast loops",
      ],
      phoneConstraint: [
        "phone should not send unchanged state repeatedly",
        "phone should not receive unchanged state repeatedly",
      ],
      laptopDesktopResponsibility: [
        "detect repeated unchanged-state patterns",
        "prepare delta-only repair guidance",
        "summarize unchanged state instead of broadcasting it",
      ],
      speedReason:
        "Avoiding unchanged-state transfer is one of the main ways Mycelium stays fast.",
      ledgerRule:
        "Unchanged derived state should not replace packet-ledger deltas.",
      cursorRule:
        "Cursors should prevent repeated transmission of already-known state.",
      deltaOnlyRule:
        "Only changes, deltas, events, cursors, and compact summaries should move.",
      deterministicStateRule:
        "Devices should not need repeated unchanged state to converge when packet deltas are correct.",
      futureNativeBoundary:
        "Delta-only output enforcement should eventually move behind native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "large_payload_split",
      direction: "bidirectional",
      preferredSizeClass: "must_split",
      purpose:
        "Requires large packet payloads or windows to be split, summarized, or deferred before movement.",
      allowedFlow: [
        "split packet window",
        "chunked bounded window",
        "compact summary first",
        "defer-to-laptop/desktop review",
      ],
      mustAvoid: [
        "single oversized packet flow",
        "large phone sync batch by default",
        "unreviewed full import",
        "slow full-state transfer",
      ],
      phoneConstraint: [
        "phone should reject, defer, or request smaller chunks when payload is too large",
        "phone should prefer summaries before large windows",
      ],
      laptopDesktopResponsibility: [
        "split larger payloads",
        "validate large windows",
        "prepare phone-safe chunks",
      ],
      speedReason:
        "Splitting large payloads prevents sync stalls and makes packet flow manageable.",
      ledgerRule:
        "Splitting must preserve packet-ledger evidence and replayability.",
      cursorRule:
        "Split windows should preserve cursor/range continuity.",
      deltaOnlyRule:
        "Split outputs should still move only needed deltas.",
      deterministicStateRule:
        "Split packet windows should replay to the same derived state as the original valid window.",
      futureNativeBoundary:
        "Large payload splitting and validation should eventually move behind Rust/WASM/native packet-flow boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      area: "flow_speed_protection",
      direction: "bidirectional",
      preferredSizeClass: "compact_summary",
      purpose:
        "Keeps Mycelium packet flow fast by making small sync movement an explicit architecture rule.",
      allowedFlow: [
        "small deltas",
        "bounded windows",
        "cursor resumes",
        "compact summaries",
        "phone-safe packet chunks",
      ],
      mustAvoid: [
        "packet floods",
        "giant sync batches",
        "full-state repetition",
        "cloud-style state replacement",
        "unbounded gossip",
      ],
      phoneConstraint: [
        "phone should remain fast, bounded, and battery-aware",
        "phone should avoid heavy packet movement by default",
      ],
      laptopDesktopResponsibility: [
        "handle heavy review",
        "compress heavy sync into smaller deltas",
        "prepare fast repair guidance",
      ],
      speedReason:
        "Fast sync comes from small packet movement, cursor discipline, and bounded windows rather than broad broadcast.",
      ledgerRule:
        "Speed optimization must not break packet-ledger truth.",
      cursorRule:
        "Cursors should minimize unnecessary packet transfer.",
      deltaOnlyRule:
        "Speed protection depends on moving only changed data.",
      deterministicStateRule:
        "Fast packet flow must still preserve deterministic convergence.",
      futureNativeBoundary:
        "Packet-flow speed and size enforcement should eventually move behind native sync/transport boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
