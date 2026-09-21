import { InitiatePaymentInput, ParsedWebhookEvent } from './payment-gateway.port';

export const FAWRY_GATEWAY = Symbol('FAWRY_GATEWAY');

/**
 * Direct FawryPay integration (`atfawry.fawrystaging.com` in staging) — the
 * "PayAtFawry" reference-number flow, verified against FawryPay's own
 * current docs (developer.fawrystaging.com): patient gets a `referenceCode`
 * good at any Fawry outlet or the myFawry app; the request/webhook signature
 * algorithms and the cancel/refund endpoints below all come from those docs
 * directly, not from any pasted sample.
 *
 * Deliberately a separate port from `PaymentGatewayPort` (Paymob) — the two
 * request/response shapes and signature schemes share nothing, and Card/
 * Mobile Wallet stay on Paymob while only Fawry moved here. Reuses
 * `ParsedWebhookEvent`/`InitiatePaymentInput`/`PaymentCustomerInfo` from
 * `payment-gateway.port.ts` since those shapes genuinely are gateway-agnostic.
 *
 * `cancelUnpaidOrder` vs `refund` — NOT interchangeable, per FawryPay's own
 * documented restriction ("as long as the status of your payment is still
 * unpaid, you can easily cancel the payment" — refund is for an
 * already-`PAID` order only, cancel is for a still-`UNPAID` one; calling the
 * wrong one is a real, rejected request, not just a style choice):
 * - Hold expires while the Fawry reference is still unpaid ->
 *   `cancelUnpaidOrder` (`CancelOnlinePaymentIntentUseCase`).
 * - A success webhook arrives after the hold already expired (money WAS
 *   captured for real) -> `refund` (`HandleLatePaymentAfterExpiryUseCase`).
 *
 * Both take FAWRY's OWN `referenceNumber` (returned by `initiatePayment`,
 * stored in `PaymentAttempt.metadata` at charge time) — never our own
 * `merchantRefNum`/`PaymentAttempt.gateway_reference`, which is a different
 * identifier FawryPay's cancel/refund endpoints don't accept.
 */
export interface InitiatedFawryPayment {
  gatewayReference: string;
  /** The code the patient takes to any Fawry outlet/kiosk, or enters in myFawry, to pay. Also the id `cancelUnpaidOrder`/`refund` key off. */
  referenceCode: string;
}

export interface FawryGatewayPort {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatedFawryPayment>;

  /** Only valid while the order is still UNPAID — see the port-level doc comment. */
  cancelUnpaidOrder(fawryReferenceNumber: string): Promise<void>;

  /** Only valid for an already-PAID order — see the port-level doc comment. */
  refund(fawryReferenceNumber: string, amount: string, reason?: string): Promise<{ gatewayRefundReference?: string }>;

  verifyWebhookSignature(rawBody: Record<string, unknown>, hmac: string | undefined): boolean;
  parseWebhookEvent(rawBody: Record<string, unknown>): ParsedWebhookEvent;
}

/**
 * `PaymentAttempt.metadata` stores `InitiatedFawryPayment` verbatim (same
 * "the whole gateway result, as JSON" convention `InitiateOnlinePaymentUseCase.completeSuccess`
 * already uses for every method) — this reads `referenceCode` back out of
 * it. `CancelOnlinePaymentIntentUseCase`/`HandleLatePaymentAfterExpiryUseCase`
 * both need this before calling `cancelUnpaidOrder`/`refund`, which key off
 * Fawry's own reference, never our `gateway_reference`.
 */
export function extractFawryReferenceCode(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'referenceCode' in metadata) {
    const value = (metadata as { referenceCode?: unknown }).referenceCode;
    return typeof value === 'string' ? value : null;
  }
  return null;
}
