export type MyceliumDeviceClass =
  | "phone"
  | "tablet"
  | "laptop"
  | "desktop"
  | "local_node"
  | "unknown";

export type MyceliumComputeClass = "light" | "medium" | "heavy";

export type MyceliumSynchronizerName =
  | "packet"
  | "phrase"
  | "meaning"
  | "correction"
  | "tombstone"
  | "identity"
  | "settings"
  | "diagnostics"
  | "ledger_portability";

export interface MyceliumDeviceRole {
  device_class: MyceliumDeviceClass;
  preferred_compute_class: MyceliumComputeClass;
  can_run_heavy_reconciliation: boolean;
  should_avoid_background_heavy_work: boolean;
  notes: string[];
}

export interface MyceliumSynchronizerBoundary {
  name: MyceliumSynchronizerName;
  description: string;
  phone_safe: boolean;
  laptop_preferred_for_heavy_work: boolean;
  changes_only: boolean;
}

export interface MultiDeviceSyncPlan {
  principle: string;
  device_roles: MyceliumDeviceRole[];
  synchronizers: MyceliumSynchronizerBoundary[];
}

export function createDefaultMultiDeviceSyncPlan(): MultiDeviceSyncPlan {
  return {
    principle:
      "One Mycelium protocol core across multiple device shells; same valid packets must derive the same state.",
    device_roles: [
      {
        device_class: "phone",
        preferred_compute_class: "light",
        can_run_heavy_reconciliation: false,
        should_avoid_background_heavy_work: true,
        notes: [
          "Mobile identity and local contribution node.",
          "Performs bounded local work.",
          "Defers heavy reconciliation when laptop or desktop nodes are available.",
        ],
      },
      {
        device_class: "laptop",
        preferred_compute_class: "heavy",
        can_run_heavy_reconciliation: true,
        should_avoid_background_heavy_work: false,
        notes: [
          "Heavier validation, diagnostics, indexing, export/import, and reconciliation node.",
        ],
      },
      {
        device_class: "desktop",
        preferred_compute_class: "heavy",
        can_run_heavy_reconciliation: true,
        should_avoid_background_heavy_work: false,
        notes: [
          "Stable high-capacity local node for storage, validation, and future native-core work.",
        ],
      },
    ],
    synchronizers: [
      {
        name: "packet",
        description: "Synchronizes valid packet deltas using cursors.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: true,
        changes_only: true,
      },
      {
        name: "phrase",
        description: "Synchronizes phrase observation state derived from packets.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "meaning",
        description: "Synchronizes meaning proposals and votes derived from packets.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "correction",
        description: "Synchronizes correction proposals and votes.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "tombstone",
        description: "Synchronizes tombstone proposals and votes without executing deletion.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "identity",
        description: "Synchronizes safe node identity metadata where permitted.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "settings",
        description: "Keeps local settings separate unless explicit sync is later allowed.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: false,
        changes_only: true,
      },
      {
        name: "diagnostics",
        description: "Reports node status without changing packet truth.",
        phone_safe: true,
        laptop_preferred_for_heavy_work: true,
        changes_only: true,
      },
      {
        name: "ledger_portability",
        description: "Supports export/import boundaries for valid ledger packets.",
        phone_safe: false,
        laptop_preferred_for_heavy_work: true,
        changes_only: false,
      },
    ],
  };
}
