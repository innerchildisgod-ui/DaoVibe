import type { PeerSyncCursor } from "../storage/sqliteStore";
import {
  MYCELIUM_API_VERSION,
  MYCELIUM_APP_CONTRACT_VERSION,
  MYCELIUM_PROTOCOL_VERSION,
} from "./MyceliumVersions";

export type LocalNodeIdentityUpdate = {
  display_name?: string;
  default_author?: string;
};

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

