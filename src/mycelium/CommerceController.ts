import type { LanguageEngine } from "../engine";

export class CommerceController {
  constructor(private readonly engine: LanguageEngine) {}

  getPaymentStatusSummary(paymentIntentId: string) {
    return this.engine.getPaymentStatusSummary(paymentIntentId);
  }

  getOrderFulfillmentStatusSummary(orderReferenceId: string) {
    return this.engine.getOrderFulfillmentStatusSummary(orderReferenceId);
  }
}
