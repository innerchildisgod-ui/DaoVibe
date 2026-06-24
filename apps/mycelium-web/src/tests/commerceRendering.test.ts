import { describe, expect, it } from "vitest";
import type { AppState } from "../appState";
import { renderCommerceStatus } from "../commerceRendering";

function createCommerceRenderState(
  overrides: Partial<AppState> = {}
): AppState {
  return {
    loading: false,
    loadingPhrase: false,
    loadingExplanation: false,
    loadingPacketTrace: false,
    loadingDiagnostics: false,
    loadingGovernance: false,
    loadingCommerce: false,
    observingPhrase: false,
    proposingMeaning: false,
    proposingCorrection: false,
    votingCorrection: false,
    searchQuery: "",
    commerceLookupForm: {
      paymentIntentId: "",
      orderReferenceId: "",
    },
    observeForm: {
      surfaceText: "",
      languageHint: "",
      phoneticHint: "",
    },
    proposeForm: {
      phraseId: "",
      referenceMeaning: "",
      context: "",
      confidence: "0.5",
    },
    correctionProposalForm: {
      phraseId: "",
      originalMeaningId: "",
      correctionId: "",
      correctedReferenceMeaning: "",
      correctionContext: "",
      source: "",
    },
    correctionVoteForm: {
      phraseId: "",
      correctionId: "",
      vote: "confirm",
      voter: "",
    },
    ...overrides,
  };
}

describe("renderCommerceStatus", () => {
  it("renders read-only commerce lookup forms", () => {
    const html = renderCommerceStatus(createCommerceRenderState());

    expect(html).toContain("Read-only payment and fulfillment lookup");
    expect(html).toContain('id="payment-status-form"');
    expect(html).toContain('name="payment_intent_id"');
    expect(html).toContain('id="order-fulfillment-status-form"');
    expect(html).toContain('name="order_reference_id"');
    expect(html).toContain("No payment status loaded yet.");
    expect(html).toContain("No order fulfillment status loaded yet.");
  });

  it("renders loaded payment and order fulfillment summaries", () => {
    const html = renderCommerceStatus(
      createCommerceRenderState({
        commerceLookupForm: {
          paymentIntentId: "payment_unit_render",
          orderReferenceId: "order_unit_render",
        },
        paymentStatus: {
          ok: true,
          summary: {
            payment_intent_id: "payment_unit_render",
            status: "vendor_received",
            order_reference_id: "order_unit_render",
            proof_id: "proof_unit_render",
            acknowledgement_id: "ack_unit_render",
            acknowledgement_status: "received",
            amount_minor_units: 1234,
            currency_code: "SBP",
          },
        },
        orderFulfillmentStatus: {
          ok: true,
          summary: {
            order_reference_id: "order_unit_render",
            status: "fulfillment_completed",
            payment_intent_id: "payment_unit_render",
            proof_id: "proof_unit_render",
            acknowledgement_id: "ack_unit_render",
            fulfillment_id: "fulfillment_unit_render",
            completion_id: "completion_unit_render",
            fulfilled_started_at: 111,
            fulfilled_completed_at: 222,
            memo: "unit render memo",
          },
        },
      })
    );

    expect(html).toContain("Payment status");
    expect(html).toContain("vendor_received");
    expect(html).toContain("proof_unit_render");
    expect(html).toContain("Order fulfillment status");
    expect(html).toContain("fulfillment_completed");
    expect(html).toContain("completion_unit_render");
    expect(html).toContain("unit render memo");
  });
});
