import type {
  OrderFulfillmentStatusSummary,
  PaymentStatusSummary,
} from "@mycelium/client";
import type { AppState } from "./appState";
import { field } from "./formRendering";
import {
  escapeAttribute,
  escapeHtml,
  formatTimestamp,
  text,
} from "./uiFormatting";

function rawField(label: string, html: string): string {
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${html}</strong>
    </div>
  `;
}

function kycClaimLink(kycClaimId: string | undefined): string {
  if (!kycClaimId) {
    return text(kycClaimId);
  }

  return `<button type="button" class="link-button" data-kyc-claim-id="${escapeAttribute(
    kycClaimId
  )}">${escapeHtml(kycClaimId)}</button>`;
}

function renderPaymentSummary(
  summary: PaymentStatusSummary | undefined
): string {
  if (!summary) {
    return `<p class="empty">No payment status loaded yet.</p>`;
  }

  return `
    <div class="summary-card">
      <h3>Payment status</h3>
      ${field("payment_intent_id", text(summary.payment_intent_id))}
      ${field("status", text(summary.status))}
      ${field("order_reference_id", text(summary.order_reference_id))}
      ${rawField("buyer_kyc_claim_id", kycClaimLink(summary.buyer_kyc_claim_id))}
      ${rawField("vendor_kyc_claim_id", kycClaimLink(summary.vendor_kyc_claim_id))}
      ${field("proof_id", text(summary.proof_id))}
      ${field("acknowledgement_id", text(summary.acknowledgement_id))}
      ${field("acknowledgement_status", text(summary.acknowledgement_status))}
      ${field("amount_minor_units", text(summary.amount_minor_units))}
      ${field("currency_code", text(summary.currency_code))}
    </div>
  `;
}

function renderOrderFulfillmentSummary(
  summary: OrderFulfillmentStatusSummary | undefined
): string {
  if (!summary) {
    return `<p class="empty">No order fulfillment status loaded yet.</p>`;
  }

  return `
    <div class="summary-card">
      <h3>Order fulfillment status</h3>
      ${field("order_reference_id", text(summary.order_reference_id))}
      ${field("status", text(summary.status))}
      ${field("payment_intent_id", text(summary.payment_intent_id))}
      ${rawField("buyer_kyc_claim_id", kycClaimLink(summary.buyer_kyc_claim_id))}
      ${rawField("vendor_kyc_claim_id", kycClaimLink(summary.vendor_kyc_claim_id))}
      ${field("proof_id", text(summary.proof_id))}
      ${field("acknowledgement_id", text(summary.acknowledgement_id))}
      ${field("fulfillment_id", text(summary.fulfillment_id))}
      ${field("completion_id", text(summary.completion_id))}
      ${field("fulfilled_started_at", formatTimestamp(summary.fulfilled_started_at))}
      ${field(
        "fulfilled_completed_at",
        formatTimestamp(summary.fulfilled_completed_at)
      )}
      ${field("memo", text(summary.memo))}
    </div>
  `;
}

export function renderCommerceStatus(state: AppState): string {
  return `
    <section class="card">
      <h2>Commerce status</h2>
      <p class="muted">
        Read-only payment and fulfillment lookup. This panel does not create packets.
      </p>

      ${
        state.commerceError
          ? `<p class="message error">${escapeHtml(state.commerceError)}</p>`
          : ""
      }

      <div class="grid two">
        <form id="payment-status-form" class="stack">
          <label>
            payment_intent_id
            <input
              name="payment_intent_id"
              value="${escapeAttribute(state.commerceLookupForm.paymentIntentId)}"
              placeholder="payment_intent_..."
            />
          </label>
          <button type="submit" ${state.loadingCommerce ? "disabled" : ""}>
            ${state.loadingCommerce ? "Loading." : "Load payment status"}
          </button>
        </form>

        <form id="order-fulfillment-status-form" class="stack">
          <label>
            order_reference_id
            <input
              name="order_reference_id"
              value="${escapeAttribute(state.commerceLookupForm.orderReferenceId)}"
              placeholder="order_..."
            />
          </label>
          <button type="submit" ${state.loadingCommerce ? "disabled" : ""}>
            ${state.loadingCommerce ? "Loading." : "Load fulfillment status"}
          </button>
        </form>
      </div>

      <div class="grid two">
        ${renderPaymentSummary(state.paymentStatus?.summary)}
        ${renderOrderFulfillmentSummary(state.orderFulfillmentStatus?.summary)}
      </div>
    </section>
  `;
}
