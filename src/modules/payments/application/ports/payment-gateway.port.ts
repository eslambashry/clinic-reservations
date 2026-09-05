export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/**
 * File 12 Part 50 / DEC-001 (File 10 Part 10: gateway = Paymob, recommended,
 * not yet contracted). Mirrors the `OtpSenderPort` shape (File 12 Part 04) —
 * use-cases depend on this interface only, so the concrete gateway can be
 * swapped (or, for CARD/FAWRY/MOBILE_WALLET specifically, actually wired up
 * once Paymob credentials exist) with zero use-case changes. Unlike
 * `OtpSenderPort`'s `LoggingOtpSender` placeholder, the bound implementation
 * here (`PaymobPaymentGatewayAdapter`) is a real integration against
 * Paymob's documented Accept API — it only fails at call time, with a clear
 * `PAYMENT_GATEWAY_NOT_CONFIGURED` error, if the required env vars are
 * unset (never a fake/simulated success).
 *
 * Never build a separate direct integration per telecom wallet (Vodafone
 * Cash/Etisalat Cash/Orange Cash) — `initiateMobileWalletPayment` passes the
 * chosen `walletProvider` through to the one aggregator integration.
 */
export interface PaymentCustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface InitiatePaymentInput {
  /**
   * Our own `PaymentAttempt.id` (not the intent's id — a retried payment
   * gets a fresh attempt, and therefore a fresh, unambiguous correlation
   * key). Sent to the gateway as its "merchant order id" so a later webhook
   * can be correlated back to this exact attempt without trusting any
   * client-supplied identifier.
   */
  merchantReference: string;
  /** Decimal string, e.g. "200.00" — converted to integer cents internally (Paymob's API is cents-denominated). */
  amount: string;
  currency: string;
  customer: PaymentCustomerInfo;
}

export interface InitiateMobileWalletPaymentInput extends InitiatePaymentInput {
  walletProvider: 'VODAFONE_CASH' | 'ETISALAT_CASH' | 'ORANGE_CASH';
  /** The wallet-linked mobile number — never a PIN/OTP; the telecom app/USSD prompt handles the user's approval, this backend never sees a wallet credential. */
  walletMobileNumber: string;
}

export interface InitiatedCardPayment {
  /** The gateway's own transaction id — stored as `PaymentAttempt.gateway_reference`, and how a later webhook is correlated back to this attempt. */
  gatewayReference: string;
  /** Hosted iframe URL — the client embeds/redirects to this; card data never touches our backend. */
  redirectUrl: string;
}

export interface InitiatedFawryPayment {
  gatewayReference: string;
  /** The code the patient takes to any Fawry outlet/kiosk to pay. */
  referenceCode: string;
}

export interface InitiatedMobileWalletPayment {
  gatewayReference: string;
  /** Where the client sends the patient to approve the payment (USSD prompt / telecom app deep link, gateway-hosted). */
  redirectUrl: string;
}

export interface ParsedWebhookEvent {
  /** Matches `PaymentAttempt.gateway_reference` — the join key back to our own records. */
  gatewayReference: string;
  /** The gateway's own transaction id (Paymob's `obj.id`) — stable across a retried delivery of the same event, used as `webhook_events.idempotency_key` (distinct from `gatewayReference`, which identifies the attempt, not the delivery). */
  gatewayTransactionId: string;
  success: boolean;
  failureCode?: string;
}

export interface PaymentGatewayPort {
  initiateCardPayment(input: InitiatePaymentInput): Promise<InitiatedCardPayment>;
  initiateFawryPayment(input: InitiatePaymentInput): Promise<InitiatedFawryPayment>;
  initiateMobileWalletPayment(input: InitiateMobileWalletPaymentInput): Promise<InitiatedMobileWalletPayment>;

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
