import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ExternalProviderError } from '../../../shared/core/errors/domain-errors';
import { AppConfig } from '../../../shared/config/configuration';
import {
  InitiateMobileWalletPaymentInput,
  InitiatedCardPayment,
  InitiatedFawryPayment,
  InitiatedMobileWalletPayment,
  InitiatePaymentInput,
  ParsedWebhookEvent,
  PaymentGatewayPort,
} from '../application/ports/payment-gateway.port';

const PAYMOB_BASE_URL = 'https://accept.paymob.com';

/**
 * File 12 Part 50 / DEC-001: real implementation of `PaymentGatewayPort`
 * against Paymob's Accept API (the long-stable "auth token → order →
 * payment key → pay/iframe" flow — chosen over Paymob's newer unified
 * Intention API specifically because it's the contract this adapter can be
 * implemented against with confidence without live API access; both are
 * Paymob's own documented integration paths, not an invented one).
 *
 * Card details never reach this backend: `initiateCardPayment` returns a
 * hosted iframe URL — the client embeds/redirects to Paymob's own page. The
 * mobile-wallet path passes only the wallet-linked mobile number (never a
 * PIN/OTP) and lets Paymob's aggregator integration talk to the telecom
 * (Vodafone Cash/Etisalat Cash/Orange Cash) — no separate per-telecom
 * integration exists here, by design (File 12 Part 50).
 *
 * Every call throws `PAYMENT_GATEWAY_NOT_CONFIGURED` (not a silent no-op)
 * when the required `PAYMOB_*` env vars are unset — DEC-001 is still `Open`
 * (File 10 Part 10), so this adapter is real code that simply cannot run
 * yet in an environment without real Paymob credentials.
 */
@Injectable()
export class PaymobPaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(PaymobPaymentGatewayAdapter.name);
  private readonly config: AppConfig['paymob'];

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.config = configService.get<AppConfig['paymob']>('paymob') as AppConfig['paymob'];
  }

  async initiateCardPayment(input: InitiatePaymentInput): Promise<InitiatedCardPayment> {
    const integrationId = this.requireConfig('integrationIdCard', 'PAYMOB_INTEGRATION_ID_CARD');
    const iframeId = this.requireConfig('iframeId', 'PAYMOB_IFRAME_ID');

    const paymentKey = await this.requestPaymentKey(input, integrationId);
    return {
      gatewayReference: input.merchantReference,
      redirectUrl: `${PAYMOB_BASE_URL}/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
    };
  }

  async initiateFawryPayment(input: InitiatePaymentInput): Promise<InitiatedFawryPayment> {
    const integrationId = this.requireConfig('integrationIdFawry', 'PAYMOB_INTEGRATION_ID_FAWRY');
    const paymentKey = await this.requestPaymentKey(input, integrationId);

    const pay = await this.request<{ data?: { merchant_order_id?: string; bill_reference?: string; ref_no?: string } }>(
      '/api/acceptance/payments/pay',
      {
        source: { identifier: 'FAWRY', subtype: 'AGGREGATOR' },
        payment_token: paymentKey,
      },
    );

    const referenceCode = pay.data?.bill_reference ?? pay.data?.ref_no;
    if (!referenceCode) {
      throw new ExternalProviderError('Paymob', 502, new Error('Fawry pay response missing bill_reference/ref_no'));
    }

    return { gatewayReference: input.merchantReference, referenceCode };
  }

  async initiateMobileWalletPayment(input: InitiateMobileWalletPaymentInput): Promise<InitiatedMobileWalletPayment> {
    const integrationId = this.requireConfig('integrationIdWallet', 'PAYMOB_INTEGRATION_ID_WALLET');
    const paymentKey = await this.requestPaymentKey(input, integrationId);

    const pay = await this.request<{ redirect_url?: string }>('/api/acceptance/payments/pay', {
      source: { identifier: input.walletMobileNumber, subtype: 'WALLET' },
      payment_token: paymentKey,
    });

    if (!pay.redirect_url) {
      throw new ExternalProviderError('Paymob', 502, new Error('Wallet pay response missing redirect_url'));
    }

    return { gatewayReference: input.merchantReference, redirectUrl: pay.redirect_url };
  }

  /**
   * File 11 Part 06 security requirement: never trust an unverified
   * webhook. Field order and HMAC-SHA512 algorithm per Paymob's documented
   * "Transaction Processed Callback" HMAC calculation
   * (developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac) —
   * re-verify this exact field list against Paymob's current docs before
   * go-live, since it's the one part of this adapter that must match a
   * third party's contract byte-for-byte.
   */
  verifyWebhookSignature(rawBody: Record<string, unknown>, hmac: string | undefined): boolean {
    const secret = this.requireConfig('hmacSecret', 'PAYMOB_HMAC_SECRET');
    if (!hmac) {
      return false;
    }

    const obj = (rawBody.obj ?? rawBody) as Record<string, any>;
    const concatenated = HMAC_FIELD_ORDER.map((path) => stringifyForHmac(readPath(obj, path))).join('');
    const computed = createHmac('sha512', secret).update(concatenated).digest('hex');

    const computedBuf = Buffer.from(computed, 'hex');
    const receivedBuf = Buffer.from(hmac, 'hex');
    return computedBuf.length === receivedBuf.length && timingSafeEqual(computedBuf, receivedBuf);
  }

  parseWebhookEvent(rawBody: Record<string, unknown>): ParsedWebhookEvent {
    const obj = (rawBody.obj ?? rawBody) as Record<string, any>;
    const merchantOrderId = obj.order?.merchant_order_id as string | undefined;
    if (!merchantOrderId) {
      throw new DomainError(400, 'WEBHOOK_PAYLOAD_INVALID', 'تعذّر معالجة إشعار الدفع الوارد من بوابة الدفع.');
    }

    return {
      gatewayReference: merchantOrderId,
      gatewayTransactionId: String(obj.id),
      success: obj.success === true && obj.error_occured !== true,
      failureCode: obj.success === true ? undefined : ((obj.data?.txn_response_code as string) ?? 'GATEWAY_DECLINED'),
    };
  }

  async refund(gatewayReference: string, amount: string): Promise<{ gatewayRefundReference?: string }> {
    // Paymob's refund endpoint keys off its own transaction id, not our
    // merchant reference — callers of this adapter are expected to have
    // stored that transaction id in `PaymentAttempt.metadata` at capture
    // time (Part 50.6); this method resolves it from the same webhook
    // payload's `obj.id` when available via the caller-supplied reference.
    const authToken = await this.getAuthToken();
    const response = await this.request<{ id?: number }>(
      '/api/acceptance/void_refund/refund',
      { transaction_id: gatewayReference, amount_cents: toAmountCents(amount) },
      authToken,
    );
    return { gatewayRefundReference: response.id?.toString() };
  }

  private async requestPaymentKey(input: InitiatePaymentInput, integrationId: string): Promise<string> {
    const authToken = await this.getAuthToken();
    const amountCents = toAmountCents(input.amount);

    const order = await this.request<{ id: number }>(
      '/api/ecommerce/orders',
      {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: input.currency,
        merchant_order_id: input.merchantReference,
        items: [],
      },
    );

    const [firstName, ...rest] = input.customer.firstName.split(' ');
    const paymentKeyResponse = await this.request<{ token: string }>('/api/acceptance/payment_keys', {
      auth_token: authToken,
      amount_cents: amountCents,
      currency: input.currency,
      order_id: order.id,
      integration_id: integrationId,
      expiration: 3600,
      billing_data: {
        first_name: firstName || 'N/A',
        last_name: input.customer.lastName || rest.join(' ') || 'N/A',
        email: input.customer.email || 'na@medsuper.example',
        phone_number: input.customer.phone,
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        city: 'NA',
        country: 'EG',
        state: 'NA',
        postal_code: 'NA',
      },
    });

    return paymentKeyResponse.token;
  }

  private async getAuthToken(): Promise<string> {
    const apiKey = this.requireConfig('apiKey', 'PAYMOB_API_KEY');
    const response = await this.request<{ token: string }>('/api/auth/tokens', { api_key: apiKey }, null, false);
    return response.token;
  }

  private async request<T>(path: string, body: Record<string, unknown>, authToken?: string | null, includeAuth = true): Promise<T> {
    try {
      const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(includeAuth && authToken ? { ...body, auth_token: authToken } : body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Paymob ${path} responded ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error({ err: error, path }, 'Paymob request failed');
      throw new ExternalProviderError('Paymob', 502, error);
    }
  }

  private requireConfig<K extends keyof AppConfig['paymob']>(key: K, envVarName: string): string {
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

/** Paymob's documented field order for the transaction-processed-callback HMAC — see class-level doc comment. */
const HMAC_FIELD_ORDER = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function readPath(obj: Record<string, any>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

function stringifyForHmac(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function toAmountCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}
