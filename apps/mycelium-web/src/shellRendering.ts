import type {
  LocalNodeIdentity,
  LocalNodeSettings,
  NodeDiagnosticsResponse,
  NodeStatusResponse,
  SyncStatusResponse,
} from "@mycelium/client";
import { field } from "./formRendering";
import { escapeHtml, statusText, text } from "./uiFormatting";

export type ShellRenderingState = {
  loading: boolean;
  loadingDiagnostics: boolean;
  diagnosticsError?: string;
  nodeStatus?: NodeStatusResponse;
  nodeDiagnostics?: NodeDiagnosticsResponse["diagnostics"];
  nodeIdentity?: LocalNodeIdentity;
  nodeSettings?: LocalNodeSettings;
  syncStatus?: SyncStatusResponse;
};

export function renderHeader(visibleApiBaseUrl: string): string {
  return `
    <header class="app-header">
      <div>
        <h1>DAOVibe Mycelium</h1>
        <p>local-first language layer</p>
      </div>
      <div class="api-pill">${escapeHtml(visibleApiBaseUrl)}</div>
    </header>
  `;
}

export function renderNodeStatus(state: ShellRenderingState): string {
  const status = state.nodeStatus;
  const identity = state.nodeIdentity;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Node Status</h2>
        <span class="status ${status?.service.status === "ready" ? "ok" : "warn"}">
          ${escapeHtml(text(status?.service.status, state.loading ? "loading" : "offline"))}
        </span>
      </div>
      <div class="field-grid">
        ${field("service", status?.service.name)}
        ${field("node_id", status?.node.node_id ?? identity?.node_id)}
        ${field("display_name", status?.node.display_name ?? identity?.display_name)}
        ${field("default_author", status?.node.default_author ?? identity?.default_author)}
        ${field("packet_count", status?.ledger.packet_count)}
        ${field("tombstone_execution", statusText(status?.capabilities.tombstone_execution))}
      </div>
    </section>
  `;
}

export function renderNodeDiagnostics(state: ShellRenderingState): string {
  const diagnostics = state.nodeDiagnostics;
  const isReachable =
    state.diagnosticsError === undefined && diagnostics?.server_reachable === true;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Node Diagnostics</h2>
        <div class="panel-actions">
          <span class="status ${isReachable ? "ok" : "warn"}">
            ${isReachable ? "reachable" : state.loadingDiagnostics ? "loading" : "unavailable"}
          </span>
          <button id="refresh-diagnostics" type="button" ${state.loadingDiagnostics ? "disabled" : ""}>
            ${state.loadingDiagnostics ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      ${
        state.diagnosticsError
          ? `<p class="form-message error">${escapeHtml(state.diagnosticsError)}</p>`
          : ""
      }
      <div class="field-grid">
        ${field("server_reachable", statusText(state.diagnosticsError ? false : diagnostics?.server_reachable))}
        ${field("server_time", diagnostics?.server_time)}
        ${field("uptime_seconds", diagnostics?.uptime_seconds)}
        ${field("api_version", diagnostics?.versions.api_version)}
        ${field("protocol_version", diagnostics?.versions.protocol_version)}
        ${field("app_contract_version", diagnostics?.versions.app_contract_version)}
        ${field("node_id", diagnostics?.node.node_id)}
        ${field("display_name", diagnostics?.node.display_name)}
        ${field("packet_count", diagnostics?.ledger.packet_count)}
        ${field("known_peer_count", diagnostics?.sync.known_peer_count)}
        ${field("sync_mode", diagnostics?.settings.sync_mode)}
        ${field("developer_mode", statusText(diagnostics?.settings.developer_mode))}
        ${field("show_debug_panels", statusText(diagnostics?.settings.show_debug_panels))}
        ${field("tombstone_execution", statusText(diagnostics?.safety.tombstone_execution))}
        ${field("deletion_enabled", statusText(diagnostics?.safety.deletion_enabled))}
        ${field("ledger_pruning_enabled", statusText(diagnostics?.safety.ledger_pruning_enabled))}
      </div>
    </section>
  `;
}

export function renderSyncStatus(state: ShellRenderingState): string {
  const sync = state.syncStatus?.sync;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Sync Status</h2>
        <span class="status ${sync?.enabled ? "ok" : "warn"}">
          ${sync?.enabled ? "enabled" : state.loading ? "loading" : "unavailable"}
        </span>
      </div>
      <div class="field-grid">
        ${field("mode", sync?.mode)}
        ${field("known_peer_count", sync?.known_peer_count)}
      </div>
      <div class="peer-list">
        ${
          sync && sync.peers.length > 0
            ? sync.peers
                .map(
                  (peer) => `
                    <div class="peer-row">
                      <span>${escapeHtml(peer.peer_author)}</span>
                      <strong>${escapeHtml(peer.cursor)}</strong>
                    </div>
                  `
                )
                .join("")
            : `<p class="muted">No peer cursors stored.</p>`
        }
      </div>
    </section>
  `;
}

export function renderLocalSettings(state: ShellRenderingState): string {
  const settings = state.nodeSettings;
  const statusSettings = state.nodeStatus?.settings;

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Local Settings</h2>
        <span class="status ${settings ? "ok" : "warn"}">
          ${settings ? "loaded" : state.loading ? "loading" : "unavailable"}
        </span>
      </div>
      <div class="field-grid">
        ${field("default_language_hint", settings?.default_language_hint)}
        ${field("default_safety_label", settings?.default_safety_label)}
        ${field("sync_mode", settings?.sync_mode ?? statusSettings?.sync_mode)}
        ${field("developer_mode", statusText(settings?.developer_mode ?? statusSettings?.developer_mode))}
        ${field("show_debug_panels", statusText(settings?.show_debug_panels ?? statusSettings?.show_debug_panels))}
      </div>
    </section>
  `;
}
