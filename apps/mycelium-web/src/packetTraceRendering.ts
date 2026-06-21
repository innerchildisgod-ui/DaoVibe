import type { PhrasePacketTraceResponse } from "@mycelium/client";
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
