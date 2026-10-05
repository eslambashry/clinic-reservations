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
 * request/response shapes and signature schemes share nothing. Card stays
 * on Paymob; `FAWRY` (PayAtFawry) and, since File 12 Part 55,
 * `MOBILE_WALLET` (Fawry MWALLET, Request-to-Pay) both live here. Reuses
 * `ParsedWebhookEvent`/`InitiatePaymentInput`/`PaymentCustomerInfo` from
 * `payment-gateway.port.ts` since those shapes genuinely are gateway-agnostic.
 *
 * Every Fawry request's `merchantRefNum` is the attempt's numeric
 * `fawry_merchant_ref_num` (Fawry documents it as an Integer), passed in as
 * `InitiatePaymentInput.merchantReference` — never the UUID attempt id.
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
  /** The numeric `merchantRefNum` sent to Fawry (decimal string). */
  gatewayReference: string;
  /**
   * Fawry's own `referenceNumber`. For PayAtFawry it's the code the patient
   * takes to any Fawry outlet/kiosk or enters in myFawry; for MWALLET it
   * identifies the order. Either way it's the id `cancelUnpaidOrder`/`refund`
   * key off.
   */
  referenceCode: string;
}

export interface InitiateFawryMobileWalletPaymentInput extends InitiatePaymentInput {
  /**
   * Fawry's `debitMobileWalletNo` — the customer's wallet-linked mobile
   * number, local format `01XXXXXXXXX`. Fawry sends the Request-to-Pay
   * confirmation to the wallet behind this number (Vodafone Cash, e& money,
   * Orange Cash, …); the backend never sees a wallet PIN/OTP and never names
   * the wallet provider — Fawry routes by number.
   */
  debitMobileWalletNo: string;
}

export interface FawryGatewayPort {
  /** PayAtFawry: returns a reference code the customer pays at a Fawry outlet or in myFawry. */
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatedFawryPayment>;

  /**
   * MWALLET Request-to-Pay: Fawry pushes a confirmation to the customer's
   * wallet app. A successful response only means the request was ACCEPTED —
   * the payment is final only once a verified Fawry server notification
   * reports `orderStatus = PAID` (`ProcessPaymentWebhookUseCase`).
   */
  initiateMobileWalletPayment(input: InitiateFawryMobileWalletPaymentInput): Promise<InitiatedFawryPayment>;

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
