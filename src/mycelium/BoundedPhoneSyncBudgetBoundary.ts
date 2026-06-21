/**
 * DAOVibe / Mycelium bounded phone sync budget boundary.
 *
 * Architecture-only.
 *
 * Phones are real bounded peer nodes, not thin clients. They may hold local
 * offline state, accept bounded packet deltas, queue outgoing events, and
 * participate in Mycelium sync. They must not be treated like unlimited
 * desktop/server nodes.
 *
 * Critical enforcement should eventually live behind Rust/WASM/native
 * boundaries. TypeScript defines the boundary here without enforcing it.
 */

export type MyceliumPhoneSyncBudgetRuntimeStatus = "architecture_only";

export type MyceliumPhoneSyncBudgetName =
  | "battery"
  | "storage"
  | "network"
  | "cpu"
  | "thermal"
  | "background_execution"
  | "ledger_scan"
  | "diagnostics"
  | "reconciliation"
  | "export_import";

export interface MyceliumBoundedPhoneSyncBudget {
  readonly name: MyceliumPhoneSyncBudgetName;
  readonly purpose: string;
  readonly phoneAllowedWork: readonly string[];
  readonly phoneAvoidWork: readonly string[];
  readonly deferToLaptopDesktopWhen: readonly string[];
  readonly laptopDesktopResponsibility: readonly string[];
  readonly ledgerRule: string;
  readonly deltaOnlyRule: string;
  readonly futureNativeBoundary: string;
  readonly runtimeStatus: MyceliumPhoneSyncBudgetRuntimeStatus;
}

export const MYCELIUM_BOUNDED_PHONE_SYNC_BUDGET_CORE_RULES = [
  "Phones are real bounded Mycelium peer nodes, not thin clients.",
  "Phones may hold local offline state needed for Mycelium use.",
  "Phones may accept bounded packet, phrase, meaning, correction, tombstone, identity, settings, diagnostics, and ledger portability deltas.",
  "Phones should avoid heavy reconciliation, full ledger scans, bulk diagnostics, and large export/import work unless future policy explicitly allows it.",
  "Laptops/desktops are preferred for heavier compute, storage, validation, diagnostics, indexing, export/import, and reconciliation.",
  "Packet ledger remains the source of truth.",
  "Only changes, deltas, and events should sync.",
  "Repeated unchanged state must not be transmitted.",
  "Same valid packets must derive the same state on every device.",
  "Critical enforcement should eventually move behind Rust/WASM/native boundaries.",
] as const;

export const MYCELIUM_BOUNDED_PHONE_SYNC_BUDGET_BOUNDARY: readonly MyceliumBoundedPhoneSyncBudget[] =
  [
    {
      name: "battery",
      purpose:
        "Keeps phone sync participation battery-aware so Mycelium can run on mobile devices without treating them like always-powered desktop nodes.",
      phoneAllowedWork: [
        "accept small bounded packet deltas",
        "serve local/offline Mycelium reads",
        "queue small outgoing change events",
        "perform lightweight validation needed for safe local use",
      ],
      phoneAvoidWork: [
        "continuous background sync loops",
        "large reconciliation runs",
        "bulk packet replay",
        "unbounded diagnostics",
      ],
      deferToLaptopDesktopWhen: [
        "sync requires sustained CPU/network work",
        "large packet windows need review",
        "bulk reconciliation is needed",
        "battery state is low or unknown",
      ],
      laptopDesktopResponsibility: [
        "perform heavier reconciliation",
        "run bulk packet validation",
        "handle sustained sync diagnostics",
        "prepare compact deltas for phone peers",
      ],
      ledgerRule:
        "Battery limits must not change ledger truth; phones may defer heavy work but must not invent derived state outside valid packets.",
      deltaOnlyRule:
        "Battery-aware sync should prefer small deltas and avoid repeated unchanged state transmission.",
      futureNativeBoundary:
        "Battery-aware sync admission and throttling should eventually move behind a native/mobile-safe policy boundary.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "storage",
      purpose:
        "Keeps phone storage bounded while preserving offline Mycelium usability and packet-ledger-derived state.",
      phoneAllowedWork: [
        "store local packets needed for recent/offline use",
        "store bounded phrase and meaning indexes",
        "store bounded correction and tombstone deltas",
        "retain local settings and identity state needed for offline use",
      ],
      phoneAvoidWork: [
        "unbounded full-ledger retention",
        "large diagnostic archives",
        "bulk import archives",
        "desktop-sized indexes",
      ],
      deferToLaptopDesktopWhen: [
        "full ledger archive is required",
        "large indexes need rebuilding",
        "old packet windows need compaction review",
        "portable export/import requires integrity review",
      ],
      laptopDesktopResponsibility: [
        "hold larger packet windows where policy allows",
        "run compaction and audit checks",
        "perform index rebuilds",
        "handle full ledger export/import review",
      ],
      ledgerRule:
        "Phone storage limits may bound local retention, but packet-derived state must remain reproducible from valid ledger packets.",
      deltaOnlyRule:
        "Phones should sync compact deltas rather than full repeated phrase, meaning, correction, or settings state.",
      futureNativeBoundary:
        "Storage quota decisions and ledger-retention safety checks should eventually move behind a native storage policy boundary.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "network",
      purpose:
        "Prevents phone nodes from becoming noisy sync broadcasters while preserving peer participation.",
      phoneAllowedWork: [
        "send small outgoing packet events",
        "receive bounded delta batches",
        "resume sync using cursors",
        "avoid resending unchanged state",
      ],
      phoneAvoidWork: [
        "constant gossip-style broadcasting",
        "repeated full-state transmission",
        "large import/export transfer by default",
        "unbounded peer fanout",
      ],
      deferToLaptopDesktopWhen: [
        "large sync batches are needed",
        "many peers require reconciliation",
        "network is unstable or expensive",
        "bulk ledger portability work is required",
      ],
      laptopDesktopResponsibility: [
        "coordinate heavier sync windows",
        "perform larger reconciliation transfers",
        "prepare compact packet windows",
        "run network diagnostics where policy allows",
      ],
      ledgerRule:
        "Network limits must preserve packet-ledger truth and must not replace valid packet sync with cloud-owned state.",
      deltaOnlyRule:
        "Phone network sync must prefer changes, deltas, events, and cursors over repeated unchanged state.",
      futureNativeBoundary:
        "Network throttling, cursor safety, and sync admission should eventually move behind Rust/WASM/native enforcement.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "cpu",
      purpose:
        "Keeps phone computation lightweight while allowing safe local Mycelium operation.",
      phoneAllowedWork: [
        "perform lightweight packet validation for local use",
        "derive bounded local phrase/meaning state",
        "apply small tombstone/correction deltas",
        "prepare small outgoing packets",
      ],
      phoneAvoidWork: [
        "bulk validation",
        "large scoring/indexing passes",
        "full correction audits",
        "full ledger replay by default",
      ],
      deferToLaptopDesktopWhen: [
        "workload requires heavy scoring",
        "large packet batches need validation",
        "index rebuild is needed",
        "correction/tombstone audit is needed",
      ],
      laptopDesktopResponsibility: [
        "run heavy validation",
        "perform larger scoring/indexing",
        "audit packet windows",
        "reconcile derived state from valid ledger packets",
      ],
      ledgerRule:
        "CPU limits may defer derived-state computation but must not allow phones to derive state from invalid packets.",
      deltaOnlyRule:
        "CPU-aware phone sync should process bounded deltas instead of recalculating unchanged state repeatedly.",
      futureNativeBoundary:
        "CPU-heavy validation and deterministic derivation should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "thermal",
      purpose:
        "Prevents phone sync from pushing mobile devices into sustained heat-heavy workloads.",
      phoneAllowedWork: [
        "pause or reduce heavy sync work under thermal pressure",
        "continue bounded local reads",
        "queue outgoing deltas for later sync",
        "accept urgent tombstone deltas when safe",
      ],
      phoneAvoidWork: [
        "sustained ledger replay",
        "continuous diagnostics",
        "bulk import validation",
        "large index rebuilds",
      ],
      deferToLaptopDesktopWhen: [
        "thermal pressure is high",
        "device is charging but still heat-limited",
        "large validation or reconciliation work is pending",
      ],
      laptopDesktopResponsibility: [
        "absorb heavy validation work",
        "perform reconciliation when phones defer",
        "prepare smaller sync windows for mobile nodes",
      ],
      ledgerRule:
        "Thermal deferral must not erase or rewrite packet-ledger truth.",
      deltaOnlyRule:
        "Thermal-aware sync should prefer minimal deltas and avoid repeated unchanged computation.",
      futureNativeBoundary:
        "Thermal-aware sync control should eventually be enforced by platform/native policy boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "background_execution",
      purpose:
        "Keeps future mobile shells app-store-safe by avoiding assumptions that phones can run unlimited background sync.",
      phoneAllowedWork: [
        "resume sync when app/session is active",
        "process bounded pending deltas",
        "persist local state for offline use",
        "queue outgoing events safely",
      ],
      phoneAvoidWork: [
        "always-on background daemon assumptions",
        "continuous peer discovery",
        "unbounded background reconciliation",
        "desktop-style background diagnostics",
      ],
      deferToLaptopDesktopWhen: [
        "work requires always-on execution",
        "long-running reconciliation is needed",
        "large diagnostics need to run without user session",
      ],
      laptopDesktopResponsibility: [
        "handle longer-running sync tasks",
        "run background diagnostics where appropriate",
        "support heavier reconciliation and export/import work",
      ],
      ledgerRule:
        "Background limits must not require cloud ownership of Mycelium state.",
      deltaOnlyRule:
        "Mobile shells should resume from cursors and deltas rather than repeatedly syncing unchanged state.",
      futureNativeBoundary:
        "Mobile background execution policy should eventually be enforced behind platform-specific native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "ledger_scan",
      purpose:
        "Prevents phones from being responsible for full ledger scans while preserving deterministic packet-derived state.",
      phoneAllowedWork: [
        "scan bounded recent packet windows",
        "verify small local packet batches",
        "apply needed local deltas",
        "defer older or larger windows",
      ],
      phoneAvoidWork: [
        "full ledger replay by default",
        "global packet audits",
        "unbounded correction history scans",
        "large tombstone cleanup scans",
      ],
      deferToLaptopDesktopWhen: [
        "full replay is required",
        "large audit windows are needed",
        "state mismatch requires deep reconciliation",
        "portable ledger review is required",
      ],
      laptopDesktopResponsibility: [
        "run full or large-window ledger scans",
        "audit packet consistency",
        "verify deterministic derived state",
        "produce compact reconciliation guidance",
      ],
      ledgerRule:
        "The packet ledger remains the source of truth even when phones only scan bounded windows.",
      deltaOnlyRule:
        "Ledger scan boundaries should move packet deltas/cursors, not repeated derived full state.",
      futureNativeBoundary:
        "Full ledger scan and deterministic replay enforcement should eventually move behind Rust/WASM/native boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "diagnostics",
      purpose:
        "Keeps phone diagnostics lightweight while allowing laptops/desktops to perform deeper Mycelium checks.",
      phoneAllowedWork: [
        "show lightweight local sync health",
        "report bounded packet counts or cursor summaries",
        "surface local errors needed for user repair",
      ],
      phoneAvoidWork: [
        "full packet audits",
        "large index consistency scans",
        "bulk reconciliation reports",
        "heavy correction/tombstone diagnostics",
      ],
      deferToLaptopDesktopWhen: [
        "full diagnostics report is needed",
        "index integrity needs review",
        "large packet windows need analysis",
        "device mismatch requires deep inspection",
      ],
      laptopDesktopResponsibility: [
        "run full diagnostics scans",
        "perform index and packet audits",
        "review reconciliation mismatches",
        "prepare human-readable repair summaries",
      ],
      ledgerRule:
        "Diagnostics may explain state but must not become an alternate source of truth over the packet ledger.",
      deltaOnlyRule:
        "Diagnostics sync should move compact summaries and deltas, not repeated unchanged diagnostic state.",
      futureNativeBoundary:
        "Diagnostic integrity checks should eventually move behind native validation boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "reconciliation",
      purpose:
        "Keeps phone reconciliation bounded while laptops/desktops handle heavier state comparison and repair planning.",
      phoneAllowedWork: [
        "apply bounded reconciliation deltas",
        "compare small local packet windows",
        "surface mismatch summaries",
        "defer heavy repair planning",
      ],
      phoneAvoidWork: [
        "bulk reconciliation",
        "large cross-device state comparisons",
        "unbounded packet replay",
        "full index rebuilds",
      ],
      deferToLaptopDesktopWhen: [
        "many packets differ",
        "derived state mismatch is large",
        "full packet-window comparison is needed",
        "repair plan requires audit-level checks",
      ],
      laptopDesktopResponsibility: [
        "perform bulk reconciliation",
        "compare large packet windows",
        "review deterministic derived-state mismatches",
        "prepare bounded deltas for phones",
      ],
      ledgerRule:
        "Reconciliation must converge on valid packet-ledger state, not device preference or cloud authority.",
      deltaOnlyRule:
        "Reconciliation should move missing packets, tombstones, and compact repair deltas rather than repeated full state.",
      futureNativeBoundary:
        "Reconciliation correctness should eventually move behind Rust/WASM/native deterministic-state boundaries.",
      runtimeStatus: "architecture_only",
    },
    {
      name: "export_import",
      purpose:
        "Keeps ledger portability safe by preferring laptops/desktops for large export/import operations while allowing phones bounded awareness.",
      phoneAllowedWork: [
        "show bounded export/import status",
        "hold small portable packet windows where policy allows",
        "verify small imports needed for local use",
        "defer large portability work",
      ],
      phoneAvoidWork: [
        "large full-ledger exports by default",
        "large full-ledger imports by default",
        "bulk integrity verification",
        "desktop-sized archival operations",
      ],
      deferToLaptopDesktopWhen: [
        "full ledger export is requested",
        "full ledger import is requested",
        "bulk integrity verification is needed",
        "large portability review is required",
      ],
      laptopDesktopResponsibility: [
        "perform full ledger export/import",
        "verify portability integrity",
        "run bulk packet validation",
        "prepare bounded import/export summaries for phones",
      ],
      ledgerRule:
        "Export/import must preserve packet-ledger truth and deterministic derived state.",
      deltaOnlyRule:
        "Portable sync should avoid repeated unchanged state and prefer verifiable packet windows.",
      futureNativeBoundary:
        "Ledger export/import validation should eventually move behind Rust/WASM/native integrity boundaries.",
      runtimeStatus: "architecture_only",
    },
  ] as const;
