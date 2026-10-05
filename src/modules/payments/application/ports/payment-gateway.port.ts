export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/**
 * File 12 Part 50 / DEC-001: the Paymob port, **card only** since File 12
 * Part 55 (2026-10-05). Mirrors the `OtpSenderPort` shape (File 12 Part
 * 04) — use-cases depend on this interface only. The bound implementation
 * (`PaymobPaymentGatewayAdapter`) is a real integration against Paymob's
 * Accept API; it fails at call time with `PAYMENT_GATEWAY_NOT_CONFIGURED`
 * if the env vars are unset, never with a fake success.
 *
 * `FAWRY` and `MOBILE_WALLET` are NOT on this port: both go through the
 * direct FawryPay integration (`FawryGatewayPort`, `fawry-gateway.port.ts`).
 * `PaymentIntent.method` is the routing discriminator that
 * `InitiateOnlinePaymentUseCase`, the cancel/late-refund use-cases, and
 * `ProcessPaymentWebhookUseCase` use to pick the port.
 *
 * The request/webhook shapes below (`InitiatePaymentInput`,
 * `ParsedWebhookEvent`, `PaymentCustomerInfo`, …) are gateway-agnostic and
 * shared with `FawryGatewayPort`.
 */
export interface PaymentCustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export type PaymentBillingInfo = Pick<PaymentCustomerInfo, 'firstName' | 'lastName' | 'email'>;

export interface PaymentPhoneInfo {
  phone: string;
}

export interface InitiatePaymentInput {
  /**
   * Our own per-attempt reference (never the intent's id — a retried
   * payment gets a fresh attempt, and therefore a fresh, unambiguous
   * correlation key), sent to the gateway as its "merchant order id" so a
   * later webhook can be correlated back to this exact attempt without
   * trusting any client-supplied identifier. Paymob gets the attempt's UUID
   * (`PaymentAttempt.id`); Fawry gets the numeric
   * `PaymentAttempt.fawry_merchant_ref_num` as a decimal string, because
   * Fawry documents `merchantRefNum` as an Integer (File 12 Part 55).
   */
  merchantReference: string;
  /** Decimal string, e.g. "200.00" — converted to integer cents internally (Paymob's API is cents-denominated). */
  amount: string;
  currency: string;
  customer: PaymentCustomerInfo;
  /**
   * File 12 Part 51: the SAME deadline the caller is using internally
   * (`AppointmentHold.expires_at` for an appointment payment, or the
   * top-up's own window) — computed once by the caller and reused here,
   * never recalculated independently. Passed through to the gateway on a
   * best-effort basis: Paymob's officially documented `expiration` field
   * (seconds, confirmed on the modern Intention API) is NOT confirmed by
   * current official documentation to bound a Fawry/mobile-wallet
   * reference's validity on the legacy Accept flow this adapter uses (see
   * `PaymobPaymentGatewayAdapter`'s doc comment) — so this can only ever be
   * an additional, unverified layer. The internal hold-expiry ->
   * cancel-intent -> late-payment-refund mechanism remains the sole
   * guaranteed source of truth regardless of what this achieves upstream.
   */
  expiresAt: Date;
}

export interface InitiatedCardPayment {
  /** The gateway's own transaction id — stored as `PaymentAttempt.gateway_reference`, and how a later webhook is correlated back to this attempt. */
  gatewayReference: string;
  /** Hosted iframe URL — the client embeds/redirects to this; card data never touches our backend. */
  redirectUrl: string;
}

export interface ParsedWebhookEvent {
  /**
   * The merchant reference the gateway echoes back — the join key to our
   * own records: `PaymentAttempt.gateway_reference` for Paymob, and
   * `PaymentAttempt.fawry_merchant_ref_num` for Fawry (or, for a Fawry
   * attempt created before File 12 Part 55, its legacy UUID
   * `gateway_reference`). See `FindPaymentByGatewayReferenceUseCase`.
   */
  gatewayReference: string;
  /** The gateway's own transaction id (Paymob's `obj.id`) — stable across a retried delivery of the same event, used as `webhook_events.idempotency_key` (distinct from `gatewayReference`, which identifies the attempt, not the delivery). */
  gatewayTransactionId: string;
  success: boolean;
  failureCode?: string;
}

export interface PaymentGatewayPort {
  initiateCardPayment(input: InitiatePaymentInput): Promise<InitiatedCardPayment>;

  /**
   * File 11 Part 06 / this task's security requirements: never trust a
   * frontend-reported success flag — every capture is gated on this passing
   * first. `hmac` is whatever the gateway sent (a query param for Paymob);
   * `rawBody` is the untouched webhook payload.
   */
  verifyWebhookSignature(rawBody: Record<string, unknown>, hmac: string | undefined): boolean;
  parseWebhookEvent(rawBody: Record<string, unknown>): ParsedWebhookEvent;

  /** File 12 Part 50.6 — used only for the late-webhook-after-expiry auto-refund path; amount is in the intent's own currency, decimal string. */
  refund(gatewayReference: string, amount: string): Promise<{ gatewayRefundReference?: string }>;
}
