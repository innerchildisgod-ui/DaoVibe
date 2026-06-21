/**
 * DAOVibe / Mycelium sync cursor and packet window contract boundary.
 *
 * Architecture-only.
 *
 * This file defines how Mycelium should describe cursor-based sync windows
 * before adding more runtime sync behavior.
 *
 * The packet ledger remains the source of truth. Devices should exchange
 * changes, deltas, events, cursors, packet windows, and compact summaries.
 * They must not repeatedly transmit unchanged derived state.
 *
 * This boundary does not implement sync execution, peer discovery, networking,
 * storage, scheduling, cloud sync, mobile behavior, or desktop packaging.
 */

export type MyceliumSyncCursorWindowRuntimeStatus = "architecture_only";

export type MyceliumSyncWindowKind =
  | "packet_delta_window"
  | "missing_packet_window"
  | "tombstone_window"
  | "correction_window"
  | "identity_window"
  | "settings_window"
  | "diagnostics_summary_window"
  | "ledger_portability_window";

export type MyceliumSyncCursorRole =
  | "resume_after_known_packet"
  | "bound_packet_scan"
  | "avoid_repeated_state"
  | "detect_missing_packets"
  | "support_phone_safe_sync"
  | "support_laptop_desktop_reconciliation";

export interface MyceliumSyncCursorWindowContract {
  readonly kind: MyceliumSyncWindowKind;
  readonly purpose: string;
  readonly cursorRole: readonly MyceliumSyncCursorRole[];
  readonly mayContain: readonly string[];
  readonly mustNotContain: readonly string[];
  readonly phoneConstraint: readonly string[];
  readonly laptopDesktopResponsibility: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly deterministicStateRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumSyncCursorWindowRuntimeStatus;
}

export const MYCELIUM_SYNC_CURSOR_WINDOW_CORE_RULES = [
  "The packet ledger remains the source of truth.",
  "Sync windows should move packet deltas, tombstones, corrections, cursors, and compact summaries.",
  "Repeated unchanged derived state must not be transmitted.",
  "A cursor is a resume boundary, not a source of truth.",
  "A packet window is a bounded view over ledger events, not an alternate ledger.",
  "Phones should consume bounded windows that preserve offline usability and battery safety.",
  "Laptops/desktops are preferred for larger window review, reconciliation, diagnostics, and portability checks.",
  "Same valid packets must derive the same state on every device.",
  "Window contracts must not require cloud ownership, server ownership, or desktop-only ownership.",
  "Critical cursor/window validation should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_SYNC_CURSOR_WINDOW_CONTRACT_BOUNDARY: readonly MyceliumSyncCursorWindowContract[] =
  [
    {
      kind: "packet_delta_window",
      purpose:
        "Defines the normal bounded packet-delta window used to move new ledger events after a known cursor.",
      cursorRole: [
        "resume_after_known_packet",
        "bound_packet_scan",
        "avoid_repeated_state",
        "support_phone_safe_sync",
      ],
      mayContain: [
        "new valid packet references",
        "bounded packet payloads where policy allows",
        "cursor metadata",
        "received ordering hints",
      ],
      mustNotContain: [
        "repeated unchanged full derived state",
        "cloud-owned sync state",
        "non-ledger authority",
      ],
      phoneConstraint: [
        "consume bounded packet batches",
        "resume from cursor instead of full replay by default",
        "defer large windows to laptop/desktop reconciliation",
      ],
      laptopDesktopResponsibility: [
        "review larger packet windows",
        "detect missing or invalid packets",
        "prepare phone-safe packet deltas",
      ],
      ledgerRule:
        "Packet delta windows must be backed by ledger packets and must not replace packet-ledger truth.",
      deltaOnlyRule:
        "Packet sync should move new or missing packets after a cursor, not repeated unchanged state.",
      deterministicStateRule:
        "The same valid packet window applied to the same prior packet set must derive the same state.",
      futureNativeBoundary:
        "Packet delta cursor validation should eventually move behind Rust/WASM/native sync boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "missing_packet_window",
      purpose:
        "Defines how a device can describe missing packet ranges or missing packet IDs without broadcasting full state.",
      cursorRole: [
        "detect_missing_packets",
        "bound_packet_scan",
        "support_laptop_desktop_reconciliation",
      ],
      mayContain: [
        "missing packet references",
        "bounded packet range summaries",
        "cursor gaps",
        "compact reconciliation hints",
      ],
      mustNotContain: [
        "full ledger dumps by default",
        "derived state pretending to be source truth",
        "unbounded phone reconciliation work",
      ],
      phoneConstraint: [
        "report bounded missing packet summaries",
        "apply missing packet deltas",
        "avoid heavy cross-device reconciliation",
      ],
      laptopDesktopResponsibility: [
        "compare larger packet windows",
        "prepare missing packet repair deltas",
        "audit cursor gaps",
      ],
      ledgerRule:
        "Missing packet repair must converge toward valid packet-ledger state.",
      deltaOnlyRule:
        "Repair should move missing packet deltas or compact references, not repeated full state.",
      deterministicStateRule:
        "When missing packets are restored, derived state should converge deterministically.",
      futureNativeBoundary:
        "Missing packet detection and repair validation should eventually move behind native reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "tombstone_window",
      purpose:
        "Defines bounded tombstone movement so deleted, expired, or invalidated state is not resurrected across devices.",
      cursorRole: [
        "resume_after_known_packet",
        "avoid_repeated_state",
        "support_phone_safe_sync",
      ],
      mayContain: [
        "tombstone packet deltas",
        "bounded tombstone references",
        "cleanup review hints",
      ],
      mustNotContain: [
        "silent ledger erasure",
        "non-ledger deletion authority",
        "unbounded cleanup scans on phones",
      ],
      phoneConstraint: [
        "accept tombstone deltas needed for local consistency",
        "avoid resurrecting tombstoned local state",
        "defer full tombstone audits",
      ],
      laptopDesktopResponsibility: [
        "audit larger tombstone windows",
        "review cleanup candidates",
        "prepare bounded tombstone deltas for phones",
      ],
      ledgerRule:
        "Tombstone windows must preserve the fact that tombstone packets exist in the ledger.",
      deltaOnlyRule:
        "Tombstone sync should move tombstone deltas, not repeated full cleanup state.",
      deterministicStateRule:
        "The same valid packet and tombstone set must derive the same active/inactive state.",
      futureNativeBoundary:
        "Tombstone window validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "correction_window",
      purpose:
        "Defines bounded correction proposal and vote movement without treating weak correction signals as final authority.",
      cursorRole: [
        "resume_after_known_packet",
        "avoid_repeated_state",
        "support_phone_safe_sync",
        "support_laptop_desktop_reconciliation",
      ],
      mayContain: [
        "correction proposal packet deltas",
        "correction vote packet deltas",
        "bounded contested-state summaries",
      ],
      mustNotContain: [
        "single-vote final authority",
        "unbounded correction history scans on phones",
        "derived correction state without packet support",
      ],
      phoneConstraint: [
        "accept bounded correction deltas",
        "show local correction status",
        "defer contested correction review",
      ],
      laptopDesktopResponsibility: [
        "review contested correction windows",
        "audit correction vote patterns",
        "prepare compact correction summaries",
      ],
      ledgerRule:
        "Correction windows must be derived from correction proposal, vote, tombstone, and related ledger packets.",
      deltaOnlyRule:
        "Correction sync should move correction packet deltas and compact summaries, not repeated unchanged correction state.",
      deterministicStateRule:
        "Correction status must be reproducible from the same valid correction packet set and policy rules.",
      futureNativeBoundary:
        "Correction window review should eventually move behind native validation/reconciliation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "identity_window",
      purpose:
        "Defines bounded identity/device-state sync needed for offline Mycelium use without requiring cloud identity ownership.",
      cursorRole: [
        "resume_after_known_packet",
        "avoid_repeated_state",
        "support_phone_safe_sync",
      ],
      mayContain: [
        "bounded identity packet deltas",
        "device identity references",
        "local identity state summaries",
      ],
      mustNotContain: [
        "cloud-owned identity authority",
        "unbounded identity graph sync",
        "non-ledger identity overrides",
      ],
      phoneConstraint: [
        "hold bounded identity state needed for local/offline use",
        "avoid large identity graph reconciliation",
        "defer consistency audits",
      ],
      laptopDesktopResponsibility: [
        "review identity consistency",
        "prepare bounded identity deltas",
        "diagnose identity mismatch summaries",
      ],
      ledgerRule:
        "Identity windows must preserve ledger-backed identity/device state boundaries.",
      deltaOnlyRule:
        "Identity sync should move changed identity events, not repeatedly broadcast unchanged identity state.",
      deterministicStateRule:
        "Same valid identity packets should produce the same identity-derived state under the same rules.",
      futureNativeBoundary:
        "Identity window validation should eventually move behind native identity-safety boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "settings_window",
      purpose:
        "Defines bounded settings sync without repeatedly broadcasting unchanged local preferences.",
      cursorRole: [
        "resume_after_known_packet",
        "avoid_repeated_state",
        "support_phone_safe_sync",
      ],
      mayContain: [
        "settings change packets",
        "bounded settings deltas",
        "settings conflict summaries",
      ],
      mustNotContain: [
        "repeated unchanged settings state",
        "cloud settings authority",
        "device preference overriding ledger-backed changes",
      ],
      phoneConstraint: [
        "hold local settings needed for offline use",
        "accept bounded settings deltas",
        "avoid broad settings conflict scans",
      ],
      laptopDesktopResponsibility: [
        "review settings conflicts",
        "prepare portability summaries",
        "support settings reconciliation where policy allows",
      ],
      ledgerRule:
        "Settings windows must preserve packet-backed settings changes where settings are represented as ledger events.",
      deltaOnlyRule:
        "Settings sync should move changed settings events, not repeated unchanged settings state.",
      deterministicStateRule:
        "Same valid settings packets should derive the same settings state under the same policy.",
      futureNativeBoundary:
        "Settings conflict and portability rules should eventually move behind native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "diagnostics_summary_window",
      purpose:
        "Defines compact diagnostics movement without forcing phones to run heavy diagnostics scans.",
      cursorRole: [
        "bound_packet_scan",
        "avoid_repeated_state",
        "support_laptop_desktop_reconciliation",
      ],
      mayContain: [
        "bounded cursor summaries",
        "packet count summaries",
        "mismatch summaries",
        "compact repair hints",
      ],
      mustNotContain: [
        "full diagnostics dumps by default",
        "heavy phone diagnostic scan requirements",
        "diagnostics as alternate source of truth",
      ],
      phoneConstraint: [
        "show lightweight diagnostics summaries",
        "report bounded local sync health",
        "defer deep scans",
      ],
      laptopDesktopResponsibility: [
        "run deeper diagnostics",
        "compare larger packet windows",
        "prepare compact repair guidance",
      ],
      ledgerRule:
        "Diagnostics windows may explain ledger-derived state but must not override the packet ledger.",
      deltaOnlyRule:
        "Diagnostics sync should move compact summaries and repair hints, not repeated unchanged diagnostic state.",
      deterministicStateRule:
        "Diagnostics mismatch claims should be traceable to packet differences or deterministic derivation differences.",
      futureNativeBoundary:
        "Diagnostics summary validation should eventually move behind native audit boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      kind: "ledger_portability_window",
      purpose:
        "Defines bounded Mycelium ledger portability windows for export/import review without implementing export/import runtime behavior.",
      cursorRole: [
        "bound_packet_scan",
        "avoid_repeated_state",
        "support_laptop_desktop_reconciliation",
      ],
      mayContain: [
        "bounded portable packet windows",
        "integrity summaries",
        "import/export review hints",
      ],
      mustNotContain: [
        "currency behavior",
        "payment behavior",
        "marketplace behavior",
        "non-Mycelium layer state",
      ],
      phoneConstraint: [
        "participate in bounded portability awareness",
        "verify small local imports where policy allows",
        "defer full export/import integrity review",
      ],
      laptopDesktopResponsibility: [
        "review larger portable packet windows",
        "perform bulk integrity checks",
        "prepare bounded phone-safe portability summaries",
      ],
      ledgerRule:
        "Ledger portability windows must preserve packet-ledger truth and deterministic replay safety.",
      deltaOnlyRule:
        "Portability should move verifiable packet windows and compact integrity summaries, not repeated unchanged state.",
      deterministicStateRule:
        "Portable packet windows should replay into the same derived Mycelium state under the same rules.",
      futureNativeBoundary:
        "Ledger portability window validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
