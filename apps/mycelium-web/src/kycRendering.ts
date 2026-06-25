import type { KycClaimSummary } from "@mycelium/client";
import type { AppState } from "./appState";
import { field } from "./formRendering";
import {
  escapeAttribute,
  escapeHtml,
  formatTimestamp,
  statusText,
  text,
} from "./uiFormatting";

function renderVoteCounts(
  counts: KycClaimSummary["known_verifier_vote_counts"] | undefined
): string {
  if (!counts) {
    return "Not available";
  }

  return [
    `same_person=${counts.same_person}`,
    `not_same_person=${counts.not_same_person}`,
    `unsure=${counts.unsure}`,
    `suspicious=${counts.suspicious}`,
    `low_quality=${counts.low_quality}`,
  ].join(", ");
}

function renderKycSummary(summary: KycClaimSummary | undefined): string {
  if (!summary) {
    return `<p class="empty">No KYC claim summary loaded yet.</p>`;
  }

  return `
    <div class="result-card">
      <h3>KYC claim status</h3>
      ${field("kyc_claim_id", summary.kyc_claim_id)}
      ${field("status", summary.status)}
      ${field("is_kyc_verified", statusText(summary.is_kyc_verified))}
      ${field("subject_node_id", text(summary.subject_node_id))}
      ${field("country_hint", text(summary.country_hint))}
      ${field("document_type_hint", text(summary.document_type_hint))}
      ${field("claimed_at", formatTimestamp(summary.claimed_at))}
      ${field("packet_count", text(summary.packet_count))}
      ${field("evidence_count", text(summary.evidence_count))}
      ${field("full_id_shared", statusText(summary.full_id_shared))}
      ${field("evidence_expired", statusText(summary.evidence_expired))}
      ${field("known_verifier_invite_count", text(summary.known_verifier_invite_count))}
      ${field("known_verifier_vote_counts", renderVoteCounts(summary.known_verifier_vote_counts))}
      ${field("latest_ai_result", text(summary.latest_ai_result))}
      ${field("latest_quorum_reason", text(summary.latest_quorum_reason))}
    </div>
  `;
}

export function renderKycStatus(state: AppState): string {
  return `
    <section class="panel">
      <h2>KYC status</h2>
      <p class="muted">
        Read-only KYC claim lookup. This panel shows minimized verification state from ledger packets.
      </p>
      ${
        state.kycError
          ? `<p class="message error">${escapeHtml(state.kycError)}</p>`
          : ""
      }
      <form id="kyc-claim-summary-form" class="stack">
        <label>
          kyc_claim_id
          <input
            name="kyc_claim_id"
            value="${escapeAttribute(state.kycLookupForm?.kycClaimId ?? "")}"
            placeholder="KYC claim id"
          />
        </label>
        <button type="submit" ${state.loadingKyc ? "disabled" : ""}>
          ${state.loadingKyc ? "Loading..." : "Load KYC status"}
        </button>
      </form>

      ${renderKycSummary(state.kycClaimSummary?.summary)}
    </section>
  `;
}
