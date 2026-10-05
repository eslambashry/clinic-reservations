import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ExternalProviderError } from '../../../shared/core/errors/domain-errors';
import { AppConfig } from '../../../shared/config/configuration';
import { InitiatePaymentInput, ParsedWebhookEvent } from '../application/ports/payment-gateway.port';
import {
  FawryGatewayPort,
  InitiateFawryMobileWalletPaymentInput,
  InitiatedFawryPayment,
} from '../application/ports/fawry-gateway.port';

/** Staging default — FawryPay's own documented sandbox host. Production requires `FAWRY_BASE_URL` to be set explicitly. */
const FAWRY_STAGING_BASE_URL = 'https://atfawry.fawrystaging.com';
const LANGUAGE = 'ar-eg';

const PAY_AT_FAWRY_METHOD = 'PayAtFawry';
const PAYATFAWRY_CHARGE_PATH = '/ECommerceWeb/Fawry/payments/charge';

/** Fawry's Mobile Wallet docs use a different charge path than PayAtFawry's. */
const MWALLET_METHOD = 'MWALLET';
const MWALLET_CHARGE_PATH = '/ECommerceWeb/api/payments/charge';

/**
 * Real implementation of `FawryGatewayPort` against FawryPay's own APIs —
 * direct integration, not through Paymob (see `FawryGatewayPort`'s doc
 * comment for why). Every field/endpoint/signature formula here was verified
 * against FawryPay's current official docs (developer.fawrystaging.com),
 * not assumed from a pasted example:
 * - PayAtFawry charge (`POST /ECommerceWeb/Fawry/payments/charge`): request
 *   signature = SHA-256(merchantCode + merchantRefNum + paymentMethod +
 *   amount(2dp) + secureKey) — `customerProfileId` is optional and this
 *   system has no equivalent concept, so it's omitted (and correctly left
 *   out of the signature too, per "if exist").
 * - MWALLET Request-to-Pay charge (`POST /ECommerceWeb/api/payments/charge`,
 *   File 12 Part 55): same body plus `debitMobileWalletNo`, signature =
 *   SHA-256(merchantCode + merchantRefNum + customerProfileId("") +
 *   "MWALLET" + amount(2dp) + debitMobileWalletNo + secureKey).
 * - Both charges send `merchantRefNum` as the attempt's numeric
 *   `fawry_merchant_ref_num` (documented as an Integer), never its UUID.
 * - Cancel unpaid order (`POST /ECommerceWeb/api/orders/cancel-unpaid-order`):
 *   signature = SHA-256(orderRefNo + merchantAccount + lang + secureKey).
 *   Only valid while the order is still UNPAID.
 * - Refund (`POST /ECommerceWeb/Fawry/payments/refund`): signature =
 *   SHA-256(merchantCode + referenceNumber + refundAmount(2dp) + reason +
 *   secureKey). Only valid for an already-PAID order.
 * - Server notification (webhook) signature = SHA-256(fawryRefNumber +
 *   merchantRefNum + paymentAmount(2dp) + orderAmount(2dp) + orderStatus +
 *   paymentMethod + paymentReferenceNumber + secureKey), field name
 *   `messageSignature`, carried in the JSON body itself (not a query param
 *   like Paymob's `hmac`) — `verifyWebhookSignature`'s `hmac` parameter
 *   exists only for shape-parity with `PaymentGatewayPort`; this adapter
 *   reads the signature from `rawBody.messageSignature` instead.
 *
 * The secure key never leaves this backend — signatures are computed here,
 * server-side, with `node:crypto`, never shipped to any client.
 *
 * Every call throws `PAYMENT_GATEWAY_NOT_CONFIGURED` when `FAWRY_MERCHANT_CODE`/
 * `FAWRY_SECURE_KEY` are unset — same discipline as `PaymobPaymentGatewayAdapter`,
 * never a fake/simulated success.
 */
@Injectable()
export class FawryPaymentGatewayAdapter implements FawryGatewayPort {
  private readonly logger = new Logger(FawryPaymentGatewayAdapter.name);
  private readonly config: AppConfig['fawry'];

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.config = configService.get<AppConfig['fawry']>('fawry') as AppConfig['fawry'];
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatedFawryPayment> {
    return this.charge(PAYATFAWRY_CHARGE_PATH, PAY_AT_FAWRY_METHOD, input);
  }

  /**
   * MWALLET Request-to-Pay (developer.fawrystaging.com, "Mobile Wallet
   * Payment"): same charge body as PayAtFawry plus `debitMobileWalletNo`,
   * which also joins the signature —
   * SHA-256(merchantCode + merchantRefNum + customerProfileId("") + "MWALLET"
   * + amount(2dp) + debitMobileWalletNo + secureKey). No QR flow: sending
   * `debitMobileWalletNo` is what makes Fawry push the confirmation to the
   * customer's wallet app instead of returning a `walletQr`.
   */
  async initiateMobileWalletPayment(input: InitiateFawryMobileWalletPaymentInput): Promise<InitiatedFawryPayment> {
    const debitMobileWalletNo = toFawryLocalMobile(input.debitMobileWalletNo);
    return this.charge(MWALLET_CHARGE_PATH, MWALLET_METHOD, input, { debitMobileWalletNo });
  }

  /**
   * Shared charge request for both payment methods. `merchantRefNum` is the
   * attempt's numeric `fawry_merchant_ref_num` (sent as a JSON number — Fawry
   * documents it as an Integer); `customerProfileId` is optional and this
   * system has no equivalent concept, so it's omitted from the body and
   * contributes "" to the signature ("if exists").
   */
  private async charge(
    path: string,
    paymentMethod: string,
    input: InitiatePaymentInput,
    extra: { debitMobileWalletNo?: string } = {},
  ): Promise<InitiatedFawryPayment> {
    const merchantCode = this.requireConfig('merchantCode', 'FAWRY_MERCHANT_CODE');
    const secureKey = this.requireConfig('secureKey', 'FAWRY_SECURE_KEY');
    const merchantRefNum = toMerchantRefNum(input.merchantReference);
    const amount = formatAmount(input.amount);

    const signature = sha256(`${merchantCode}${merchantRefNum}${paymentMethod}${amount}${extra.debitMobileWalletNo ?? ''}${secureKey}`);

    const response = await this.request<{
      referenceNumber?: string;
      statusCode?: number;
      statusDescription?: string;
    }>(path, {
      merchantCode,
      merchantRefNum,
      customerMobile: toFawryLocalMobile(input.customer.phone),
      // Customer name is optional per FawryPay's charge API. Email is
      // required upstream, so use a non-personal system address instead of
      // collecting or forwarding the patient's email.
      customerEmail: 'na@medsuper.example',
      amount,
      currencyCode: input.currency,
      language: LANGUAGE,
      // Required field, but this system has no per-item breakdown for a flat
      // appointment/wallet-top-up amount — one synthetic line item covering
      // the whole charge.
      chargeItems: [{ itemId: String(merchantRefNum), description: 'MedSuper payment', price: amount, quantity: '1' }],
      paymentExpiry: input.expiresAt.getTime(),
      paymentMethod,
      description: 'MedSuper payment',
      ...extra,
      signature,
    });

    // A 2xx HTTP response is not enough: Fawry reports business failures
    // (e.g. 9946 invalid signature) in the body's `statusCode`.
    if (!response.referenceNumber || (response.statusCode !== undefined && response.statusCode !== 200)) {
      throw new ExternalProviderError(
        'Fawry',
        502,
        new Error(`Fawry ${paymentMethod} charge failed: statusCode=${response.statusCode ?? 'none'} ${response.statusDescription ?? 'unknown error'}`),
      );
    }

    return { gatewayReference: String(merchantRefNum), referenceCode: response.referenceNumber };
  }

  /** Only valid while the order is still UNPAID (FawryPay's own documented restriction) — see the port's doc comment for when this vs. `refund` applies. */
  async cancelUnpaidOrder(fawryReferenceNumber: string): Promise<void> {
    const merchantCode = this.requireConfig('merchantCode', 'FAWRY_MERCHANT_CODE');
    const secureKey = this.requireConfig('secureKey', 'FAWRY_SECURE_KEY');
    const signature = sha256(`${fawryReferenceNumber}${merchantCode}${LANGUAGE}${secureKey}`);

    await this.request('/ECommerceWeb/api/orders/cancel-unpaid-order', {
      merchantAccount: merchantCode,
      orderRefNo: fawryReferenceNumber,
      lang: LANGUAGE,
      signature,
    });
  }

  /** Only valid for an already-PAID order — see the port's doc comment for when this vs. `cancelUnpaidOrder` applies. */
  async refund(fawryReferenceNumber: string, amount: string, reason = 'Appointment cancelled'): Promise<{ gatewayRefundReference?: string }> {
    const merchantCode = this.requireConfig('merchantCode', 'FAWRY_MERCHANT_CODE');
    const secureKey = this.requireConfig('secureKey', 'FAWRY_SECURE_KEY');
    const formattedAmount = formatAmount(amount);
    const signature = sha256(`${merchantCode}${fawryReferenceNumber}${formattedAmount}${reason}${secureKey}`);

    await this.request<{ statusCode?: number }>('/ECommerceWeb/Fawry/payments/refund', {
      merchantCode,
      referenceNumber: fawryReferenceNumber,
      refundAmount: formattedAmount,
      reason,
      signature,
    });

    // FawryPay's refund response carries no separate refund-transaction id
    // (just a status code/description) — nothing to return as a reference.
    return {};
  }

  /** `hmac` is intentionally unused — Fawry's signature lives in `rawBody.messageSignature`, not a query param like Paymob's `hmac`; the parameter exists only for shape-parity with `FawryGatewayPort`/`PaymentGatewayPort`. */
  verifyWebhookSignature(rawBody: Record<string, unknown>, hmac: string | undefined): boolean {
    void hmac;
    const secureKey = this.requireConfig('secureKey', 'FAWRY_SECURE_KEY');
    const received = rawBody.messageSignature as string | undefined;
    if (!received) {
      return false;
    }

    // Only the two amount fields are formatted to 2dp ("paymentAmount(2dp) +
    // orderAmount(2dp)" in Fawry's formula). Everything else is used as-is —
    // `merchantRefNumber` is numeric now (File 12 Part 55) and may arrive as
    // a JSON number, which must stay "123", never become "123.00".
    const concatenated =
      [
        stringifyField(rawBody.fawryRefNumber),
        stringifyField(rawBody.merchantRefNumber),
        stringifyAmount(rawBody.paymentAmount),
        stringifyAmount(rawBody.orderAmount),
        stringifyField(rawBody.orderStatus),
        stringifyField(rawBody.paymentMethod),
        stringifyField(rawBody.paymentReferenceNumber),
      ].join('') + secureKey;
    const computed = sha256(concatenated);
    return computed.toLowerCase() === received.toLowerCase();
  }

  parseWebhookEvent(rawBody: Record<string, unknown>): ParsedWebhookEvent {
    const merchantRefNumber = stringifyField(rawBody.merchantRefNumber);
    const fawryRefNumber = stringifyField(rawBody.fawryRefNumber);
    if (!merchantRefNumber || !fawryRefNumber) {
      throw new DomainError(400, 'WEBHOOK_PAYLOAD_INVALID', 'تعذّر معالجة إشعار الدفع الوارد من بوابة الدفع.');
    }

    const orderStatus = rawBody.orderStatus as string | undefined;
    return {
      gatewayReference: merchantRefNumber,
      gatewayTransactionId: fawryRefNumber,
      success: orderStatus === 'PAID',
      failureCode: orderStatus === 'PAID' ? undefined : ((rawBody.failureErrorCode as string) ?? orderStatus ?? 'GATEWAY_DECLINED'),
    };
  }

  private async request<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = this.config.baseUrl ?? FAWRY_STAGING_BASE_URL;
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Fawry ${path} responded ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error({ err: error, path }, 'Fawry request failed');
      throw new ExternalProviderError('Fawry', 502, error);
    }
  }

  private requireConfig<K extends keyof Omit<AppConfig['fawry'], 'baseUrl'>>(key: K, envVarName: string): string {
    const value = this.config[key];
    if (!value) {
      throw new DomainError(
        500,
        'PAYMENT_GATEWAY_NOT_CONFIGURED',
        'بوابة الدفع الإلكتروني غير مُهيّأة حاليًا. تواصل مع الدعم.',
        { missingEnvVar: envVarName },
      );
    }
    return value;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function formatAmount(amount: string): string {
  return Number(amount).toFixed(2);
}

/** `merchantReference` must be the numeric `fawry_merchant_ref_num` — refuse anything else rather than send Fawry a UUID. */
function toMerchantRefNum(merchantReference: string): number {
  if (!/^\d{1,15}$/.test(merchantReference)) {
    throw new Error(`Fawry merchantRefNum must be numeric, got "${merchantReference}"`);
  }
  return Number(merchantReference);
}

/** Fawry's docs show local Egyptian format (`01XXXXXXXXX`); our phones are E.164 (`+201XXXXXXXXX`). */
export function toFawryLocalMobile(phone: string): string {
  const digits = phone.replace(/[\s-]/g, '');
  if (digits.startsWith('+20')) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('20') && digits.length === 12) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function stringifyField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/** Amount fields only: Fawry's notification signature uses them in two-decimal form. */
function stringifyAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
}
