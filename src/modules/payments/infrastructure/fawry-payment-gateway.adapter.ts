import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ExternalProviderError } from '../../../shared/core/errors/domain-errors';
import { AppConfig } from '../../../shared/config/configuration';
import { InitiatePaymentInput, ParsedWebhookEvent } from '../application/ports/payment-gateway.port';
import { FawryGatewayPort, InitiatedFawryPayment } from '../application/ports/fawry-gateway.port';

/** Staging default — FawryPay's own documented sandbox host. Production requires `FAWRY_BASE_URL` to be set explicitly. */
const FAWRY_STAGING_BASE_URL = 'https://atfawry.fawrystaging.com';
const PAYMENT_METHOD = 'PayAtFawry';
const LANGUAGE = 'ar-eg';

/**
 * Real implementation of `FawryGatewayPort` against FawryPay's own
 * "PayAtFawry" reference-number API — direct integration, not through
 * Paymob (see `FawryGatewayPort`'s doc comment for why). Every field/
 * endpoint/signature formula here was verified against FawryPay's current
 * official docs (developer.fawrystaging.com), not assumed from a pasted
 * example:
 * - Charge (`POST /ECommerceWeb/Fawry/payments/charge`): request signature
 *   = SHA-256(merchantCode + merchantRefNum + paymentMethod + amount(2dp) +
 *   secureKey) — `customerProfileId` is optional and this system has no
 *   equivalent concept, so it's omitted (and correctly left out of the
 *   signature too, per "if exist").
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
    const merchantCode = this.requireConfig('merchantCode', 'FAWRY_MERCHANT_CODE');
    const secureKey = this.requireConfig('secureKey', 'FAWRY_SECURE_KEY');
    const amount = formatAmount(input.amount);
    const [firstName, ...rest] = input.customer.firstName.split(' ');

    const signature = sha256(`${merchantCode}${input.merchantReference}${PAYMENT_METHOD}${amount}${secureKey}`);

    const response = await this.request<{
      referenceNumber?: string;
      statusCode?: number;
      statusDescription?: string;
    }>('/ECommerceWeb/Fawry/payments/charge', {
      merchantCode,
      merchantRefNum: input.merchantReference,
      customerName: [firstName, ...rest].join(' ').trim() || 'N/A',
      customerMobile: input.customer.phone,
      customerEmail: input.customer.email || 'na@medsuper.example',
      amount,
      currencyCode: input.currency,
      language: LANGUAGE,
      // Required field, but this system has no per-item breakdown for a flat
      // appointment/wallet-top-up amount — one synthetic line item covering
      // the whole charge, same shape the pasted sample used (that part of
      // it, unlike its signature, matches the documented requirement).
      chargeItems: [{ itemId: input.merchantReference, description: 'MedSuper payment', price: amount, quantity: '1' }],
      paymentExpiry: input.expiresAt.getTime(),
      paymentMethod: PAYMENT_METHOD,
      description: 'MedSuper payment',
      signature,
    });

    if (!response.referenceNumber) {
      throw new ExternalProviderError('Fawry', 502, new Error(`Fawry charge response missing referenceNumber: ${response.statusDescription ?? 'unknown error'}`));
    }

    return { gatewayReference: input.merchantReference, referenceCode: response.referenceNumber };
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

    const fields = [
      'fawryRefNumber',
      'merchantRefNumber',
      'paymentAmount',
      'orderAmount',
      'orderStatus',
      'paymentMethod',
      'paymentReferenceNumber',
    ];
    const concatenated = fields.map((field) => stringifyField(rawBody[field])).join('') + secureKey;
    const computed = sha256(concatenated);
    return computed.toLowerCase() === received.toLowerCase();
  }

  parseWebhookEvent(rawBody: Record<string, unknown>): ParsedWebhookEvent {
    const merchantRefNumber = rawBody.merchantRefNumber as string | undefined;
    const fawryRefNumber = rawBody.fawryRefNumber as string | undefined;
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

function stringifyField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'number' ? value.toFixed(2) : String(value);
}
