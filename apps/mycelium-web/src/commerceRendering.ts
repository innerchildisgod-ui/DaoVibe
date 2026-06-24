import type {
  OrderFulfillmentStatusSummary,
  PaymentStatusSummary,
} from "@mycelium/client";
import type { AppState } from "./appState";
import { field } from "./formRendering";
import { escapeAttribute, escapeHtml, text } from "./uiFormatting";

function renderPaymentSummary(summary: PaymentStatusSummary | undefined): string {
  if (!summary) {
    return `<p class="empty">No payment status loaded yet.</p>`;
  }

  return `
    <div class="result-card">
      <h3>Payment status</h3>
      ${field("payment_intent_id", summary.payment_intent_id)}
      ${field("status", summary.status)}
      ${field("order_reference_id", text(summary.order_reference_id))}
      ${field("proof_id", text(summary.proof_id))}
      ${field("acknowledgement_id", text(summary.acknowledgement_id))}
      ${field("acknowledgement_status", text(summary.acknowledgement_status))}
      ${field("amount_minor_units", text(summary.amount_minor_units))}
      ${field("currency_code", text(summary.currency_code))}
      ${field("reason", text(summary.reason))}
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
    <div class="result-card">
      <h3>Order fulfillment status</h3>
      ${field("order_reference_id", summary.order_reference_id)}
      ${field("status", summary.status)}
      ${field("payment_intent_id", text(summary.payment_intent_id))}
      ${field("proof_id", text(summary.proof_id))}
      ${field("acknowledgement_id", text(summary.acknowledgement_id))}
      ${field("fulfillment_id", text(summary.fulfillment_id))}
      ${field("completion_id", text(summary.completion_id))}
      ${field("fulfilled_started_at", text(summary.fulfilled_started_at))}
      ${field("fulfilled_completed_at", text(summary.fulfilled_completed_at))}
      ${field("memo", text(summary.memo))}
    </div>
  `;
}

export function renderCommerceStatus(state: AppState): string {
  return `
    <section class="panel">
      <h2>Commerce status</h2>
      <p class="muted">
        Read-only payment and fulfillment lookup. This panel does not create packets.
      </p>
      ${
        state.commerceError
          ? `<p class="message error">${escapeHtml(state.commerceError)}</p>`
          : ""
      }
      <div class="form-grid">
        <form id="payment-status-form" class="stack">
          <label>
            payment_intent_id
            <input
              name="payment_intent_id"
              value="${escapeAttribute(state.commerceLookupForm.paymentIntentId)}"
              placeholder="payment intent id"
            />
          </label>
          <button type="submit" ${state.loadingCommerce ? "disabled" : ""}>
            ${state.loadingCommerce ? "Loading..." : "Load payment status"}
          </button>
        </form>

        <form id="order-fulfillment-status-form" class="stack">
          <label>
            order_reference_id
            <input
              name="order_reference_id"
              value="${escapeAttribute(state.commerceLookupForm.orderReferenceId)}"
              placeholder="order reference id"
            />
          </label>
          <button type="submit" ${state.loadingCommerce ? "disabled" : ""}>
            ${state.loadingCommerce ? "Loading..." : "Load fulfillment status"}
          </button>
        </form>
      </div>

      <div class="result-grid">
        ${renderPaymentSummary(state.paymentStatus?.summary)}
        ${renderOrderFulfillmentSummary(state.orderFulfillmentStatus?.summary)}
      </div>
    </section>
  `;
}
