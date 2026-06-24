import type { LanguageEngine } from "../engine";
import type {
  LocalNodeSettings,
  LocalNodeSettingsUpdate,
  LocalNodeIdentity,
  PeerSyncCursor,
  SQLiteStore,
} from "../storage/sqliteStore";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_APP_CONTRACT_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "./MyceliumVersions";

export type LocalNodeIdentityUpdate = {
  display_name?: string;
  default_author?: string;
};

type LocalNodeStore = Pick<
  SQLiteStore,
  | "getOrCreateLocalNodeIdentity"
  | "updateLocalNodeIdentity"
  | "getOrCreateLocalNodeSettings"
  | "updateLocalNodeSettings"
  | "getPacketCount"
  | "listAppliedSchemaMigrations"
  | "listPeerSyncCursors"
>;

export interface MyceliumNodeStatus {
  ok: true;
  node: {
    node_id: string;
    display_name: string;
    default_author: string;
  };
  service: {
    name: "Mycelium";
    layer: "DAOVibe Mycelium";
    status: "ready";
    uptime_seconds: number;
    server_time: number;
  };
  ledger: {
    packet_count: number;
  };
  storage: {
    durable: true;
    engine: "sqlite";
  };
  settings: {
    sync_mode: "manual";
    developer_mode: boolean;
    show_debug_panels: boolean;
  };
  versions: {
    api_version: typeof MYCELIUM_API_VERSION;
    protocol_version: typeof MYCELIUM_PROTOCOL_VERSION;
    app_contract_version: typeof MYCELIUM_APP_CONTRACT_VERSION;
  };
  capabilities: {
    phrase_lookup: true;
    meaning_proposals: true;
    meaning_votes: true;
    corrections: true;
    correction_maturity: true;
    tombstone_packets: true;
    tombstone_execution: false;
    sync: true;
  };
}

export interface MyceliumSyncStatus {
  ok: true;
  sync: {
    enabled: true;
    mode: "manual";
    known_peer_count: number;
    peers: PeerSyncCursor[];
  };
}

export interface MyceliumNodeDiagnostics {
  ok: true;
  diagnostics: {
    server_reachable: true;
    server_time: number;
    uptime_seconds: number;
    versions: MyceliumNodeStatus["versions"];
    node: MyceliumNodeStatus["node"];
    settings: {
      sync_mode: "manual";
      developer_mode: boolean;
      show_debug_panels: boolean;
      default_language_hint: string;
      default_safety_label: string;
    };
    ledger: {
      packet_count: number;
      migration_count: number;
    };
    sync: {
      enabled: true;
      mode: "manual";
      known_peer_count: number;
    };
    safety: {
      tombstone_execution: false;
      deletion_enabled: false;
      ledger_pruning_enabled: false;
    };
  };
}

export class NodeRuntimeController {
  private readonly startedAtMs = Date.now();

  constructor(private readonly engine: LanguageEngine) {}

  getLocalNodeIdentity(): LocalNodeIdentity {
    return this.localNodeIdentityStore().getOrCreateLocalNodeIdentity();
  }

  updateLocalNodeIdentity(
    input: LocalNodeIdentityUpdate
  ): LocalNodeIdentity {
    return this.localNodeIdentityStore().updateLocalNodeIdentity(input);
  }

  getLocalNodeSettings(): LocalNodeSettings {
    return this.localNodeStore().getOrCreateLocalNodeSettings();
  }

  updateLocalNodeSettings(
    input: LocalNodeSettingsUpdate
  ): LocalNodeSettings {
    return this.localNodeStore().updateLocalNodeSettings(input);
  }

  getNodeStatus(): MyceliumNodeStatus {
    const identity = this.getLocalNodeIdentity();
    const settings = this.getLocalNodeSettings();

    return {
      ok: true,
      node: {
        node_id: identity.node_id,
        display_name: identity.display_name,
        default_author: identity.default_author,
      },
      service: {
        name: "Mycelium",
        layer: "DAOVibe Mycelium",
        status: "ready",
        uptime_seconds: Math.max(
          0,
          Math.floor((Date.now() - this.startedAtMs) / 1000)
        ),
        server_time: Math.floor(Date.now() / 1000),
      },
      ledger: {
        packet_count: this.localNodeStore().getPacketCount(),
      },
      storage: {
        durable: true,
        engine: "sqlite",
      },
      settings: {
        sync_mode: settings.sync_mode,
        developer_mode: settings.developer_mode,
        show_debug_panels: settings.show_debug_panels,
      },
      versions: {
        api_version: MYCELIUM_API_VERSION,
        protocol_version: MYCELIUM_PROTOCOL_VERSION,
        app_contract_version: MYCELIUM_APP_CONTRACT_VERSION,
      },
      capabilities: {
        phrase_lookup: true,
        meaning_proposals: true,
        meaning_votes: true,
        corrections: true,
        correction_maturity: true,
        tombstone_packets: true,
        tombstone_execution: false,
        sync: true,
      },
    };
  }

  getSyncStatus(): MyceliumSyncStatus {
    const peers = this.localNodeStore().listPeerSyncCursors();

    return {
      ok: true,
      sync: {
        enabled: true,
        mode: "manual",
        known_peer_count: peers.length,
        peers,
      },
    };
  }

  getNodeDiagnostics(): MyceliumNodeDiagnostics {
    const status = this.getNodeStatus();
    const settings = this.getLocalNodeSettings();
    const syncStatus = this.getSyncStatus();

    return {
      ok: true,
      diagnostics: {
        server_reachable: true,
        server_time: status.service.server_time,
        uptime_seconds: status.service.uptime_seconds,
        versions: status.versions,
        node: status.node,
        settings: {
          sync_mode: settings.sync_mode,
          developer_mode: settings.developer_mode,
          show_debug_panels: settings.show_debug_panels,
          default_language_hint: settings.default_language_hint,
          default_safety_label: settings.default_safety_label,
        },
        ledger: {
          packet_count: status.ledger.packet_count,
          migration_count: this.localNodeStore().listAppliedSchemaMigrations()
            .length,
        },
        sync: {
          enabled: syncStatus.sync.enabled,
          mode: syncStatus.sync.mode,
          known_peer_count: syncStatus.sync.known_peer_count,
        },
        safety: {
          tombstone_execution: false,
          deletion_enabled: false,
          ledger_pruning_enabled: false,
        },
      },
    };
  }

  private localNodeIdentityStore(): LocalNodeStore {
    return this.localNodeStore();
  }

  private localNodeStore(): LocalNodeStore {
    return (this.engine as unknown as { sqliteStore: LocalNodeStore })
      .sqliteStore;
  }
}
