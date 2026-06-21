import type {
  PhrasePacketTraceResponse,
  PhraseRecord,
} from "@mycelium/client";

export type PacketTraceRenderingState = {
  loading: boolean;
  loadingPhrase: boolean;
  loadingPacketTrace: boolean;
  packetTraceError?: string;
  selectedPhrase?: PhraseRecord;
  packetTrace?: PhrasePacketTraceResponse;
};
import { escapeHtml } from "./uiFormatting";

export function renderPacketTypeCounts(trace: PhrasePacketTraceResponse): string {
  const entries = Object.entries(trace.trace.packet_types);

  if (entries.length === 0) {
    return `<p class="muted">No packet types recorded.</p>`;
  }

  return `
    <div class="packet-type-counts">
      ${entries
        .map(
          ([packetType, count]) => `
            <span>${escapeHtml(packetType)} ${escapeHtml(count)}</span>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderPacketTraceRows(trace: PhrasePacketTraceResponse): string {
  if (trace.trace.packets.length === 0) {
    return `<p class="muted">No packets found for this phrase.</p>`;
  }

  return `
    <div class="packet-trace-list">
      ${trace.trace.packets
        .map(
          (packet) => `
            <article class="packet-trace-row">
              <div class="packet-trace-heading">
                <strong>${escapeHtml(packet.packet_type)}</strong>
                <span>${escapeHtml(packet.role)}</span>
              </div>
              <p>${escapeHtml(packet.summary)}</p>
              <div class="packet-trace-meta">
                <span>packet_id ${escapeHtml(packet.packet_id)}</span>
                ${
                  packet.author
                    ? `<span>author ${escapeHtml(packet.author)}</span>`
                    : ""
                }
                ${
                  packet.created_at !== undefined
                    ? `<span>created_at ${escapeHtml(packet.created_at)}</span>`
                    : ""
                }
                ${
                  packet.received_at !== undefined
                    ? `<span>received_at ${escapeHtml(packet.received_at)}</span>`
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderPacketTrace(state: PacketTraceRenderingState): string {
  const trace = state.packetTrace;

  return `
    <section class="panel packet-trace-panel">
      <div class="panel-heading">
        <h2>Packet Trace</h2>
        <div class="panel-actions">
          <span class="status ${trace ? "ok" : "warn"}">
            ${state.loadingPacketTrace ? "loading" : trace ? "loaded" : "unavailable"}
          </span>
          <button
            id="refresh-packet-trace"
            type="button"
            ${state.loadingPacketTrace || !state.selectedPhrase ? "disabled" : ""}
          >
            ${state.loadingPacketTrace ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      ${
        state.packetTraceError
          ? `<p class="form-message error">${escapeHtml(state.packetTraceError)}</p>`
          : ""
      }
      ${
        !state.selectedPhrase
          ? `<p class="muted">Select a phrase to inspect packet evidence.</p>`
          : trace
            ? `
              <div class="field-grid">
                ${field("packet_count", trace.trace.packet_count)}
                ${field("tombstone_execution", statusText(trace.safety.tombstone_execution))}
                ${field("deletion_enabled", statusText(trace.safety.deletion_enabled))}
                ${field("ledger_pruning_enabled", statusText(trace.safety.ledger_pruning_enabled))}
              </div>
              ${renderPacketTypeCounts(trace)}
              ${renderPacketTraceRows(trace)}
            `
            : `<p class="muted">No packet trace loaded.</p>`
      }
    </section>
  `;
}
