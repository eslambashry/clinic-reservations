import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PayableType, PaymentMethod, Prisma } from '@prisma/client';
import { BusinessRuleError, DomainError } from '../../../shared/core/errors/domain-errors';
import { FAWRY_GATEWAY, FawryGatewayPort } from './ports/fawry-gateway.port';
import { PAYMENT_GATEWAY, PaymentCustomerInfo, PaymentGatewayPort } from './ports/payment-gateway.port';
import { PaymentAttemptRepository } from '../infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';

export type OnlinePaymentMethod = Extract<PaymentMethod, 'CARD' | 'FAWRY' | 'MOBILE_WALLET'>;

export interface InitiateOnlinePaymentInput {
  payerUserId: string;
  payableType: PayableType;
  payableId: string;
  amount: string;
  currency: string;
  method: OnlinePaymentMethod;
  /** Unique per intent (e.g. `hold:<holdId>`, `topup:<walletTransactionId>`) — ignored on retry. */
  idempotencyKey: string;
  customer: PaymentCustomerInfo;
  /** `MOBILE_WALLET` only: Fawry's `debitMobileWalletNo` (the wallet-linked number). Fawry picks the wallet from it — no provider is sent. */
  walletMobileNumber?: string;
  /**
   * File 12 Part 51: the same deadline the caller already computed for its
   * own bookkeeping (the hold's extended `expires_at`, or the top-up
   * window) — passed straight through to `PaymentGatewayPort` unchanged.
   * Never recomputed here; see the port's own doc comment for what this
   * is/isn't confirmed to do upstream.
   */
  expiresAt: Date;
  /** Full price when `amount` is a partial payment toward it (appointments) — stored on the intent as `full_amount`. */
  fullAmount?: string;
  /**
   * File 11 Part 13: "a FAILED attempt does not fail the intent — the
   * client may create a new attempt against the same intent, not a new
   * intent, until the hold expires." Pass the still-`CREATED` intent's id
   * to retry instead of creating a duplicate `PaymentIntent`.
   */
  existingPaymentIntentId?: string;
}

export interface PreparedOnlinePayment {
  paymentIntentId: string;
  paymentAttemptId: string;
  method: OnlinePaymentMethod;
  gatewayInput: {
    merchantReference: string;
    amount: string;
    currency: string;
    customer: PaymentCustomerInfo;
    expiresAt: Date;
    walletMobileNumber?: string;
  };
}

export interface CompletedOnlinePayment {
  metadata: Prisma.InputJsonValue;
  redirectUrl?: string;
  referenceCode?: string;
}

/**
 * File 12 Part 50: the online-payment counterpart to
 * `CapturePayAtClinicPaymentUseCase` — creates (or reuses, on retry) a
 * `PaymentIntent`, always creates a fresh `PaymentAttempt`, and calls out to
 * `PaymentGatewayPort` to get the client-facing card iframe / Fawry
 * reference / wallet redirect. Deliberately payable-type-agnostic (works
 * identically for an `APPOINTMENT` online payment and a `WALLET_TOPUP`) —
 * the caller supplies `payableType`/`payableId`, this use-case never
 * branches on them.
 *
 * Split into `prepare` (DB writes, takes the caller's `tx` so it can commit
 * atomically with the caller's own hold-side writes) / `callGateway` (the
 * live network call — deliberately NOT given a `tx`, and never call it from
 * inside one) / `completeSuccess`/`completeFailure` (the follow-up DB write,
 * its own short transaction) — a real gateway round trip (Paymob's
 * card flow is auth-token → order → payment-key, three
 * sequential HTTP calls) can exceed Prisma's ~5s interactive-transaction
 * timeout, and a DB transaction must never sit open across live third-party
 * network I/O regardless of timeout tuning. See callers
 * (`InitiateOnlineAppointmentPaymentUseCase`, `InitiateWalletTopUpUseCase`)
 * for the two-transaction pattern this implies.
 *
 * Routing (File 12 Part 55): `CARD` → `PaymentGatewayPort` (Paymob);
 * `FAWRY` (PayAtFawry) and `MOBILE_WALLET` (MWALLET Request-to-Pay) →
 * `FawryGatewayPort`, a single charge call each. Paymob gets the attempt's
 * UUID as its merchant reference; Fawry gets the attempt's numeric
 * `fawry_merchant_ref_num`, because Fawry documents `merchantRefNum` as an
 * Integer.
 */
@Injectable()
export class InitiateOnlinePaymentUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(FAWRY_GATEWAY) private readonly fawryGateway: FawryGatewayPort,
  ) {}

  async prepare(tx: Prisma.TransactionClient, input: InitiateOnlinePaymentInput): Promise<PreparedOnlinePayment> {
    const intent = input.existingPaymentIntentId
      ? await this.loadRetryableIntent(tx, input.existingPaymentIntentId)
      : await this.paymentIntents.create(tx, {
          payerUserId: input.payerUserId,
          payableType: input.payableType,
          payableId: input.payableId,
          amount: input.amount,
          currency: input.currency,
          idempotencyKey: input.idempotencyKey,
          method: input.method,
          fullAmount: input.fullAmount,
        });

    const attemptId = randomUUID();
    // `gateway_reference` is our OWN generated id, set at creation time,
    // before the gateway even knows this attempt exists, so a webhook can
    // always be correlated back regardless of how/when the gateway assigns
    // its own transaction id. Paymob is sent this UUID; Fawry is sent the
    // DB-assigned numeric `fawry_merchant_ref_num` instead (File 12 Part 55).
    const attempt = await this.paymentAttempts.create(tx, { id: attemptId, paymentIntentId: intent.id, gatewayReference: attemptId });
    const merchantReference = input.method === 'CARD' ? attemptId : attempt.fawry_merchant_ref_num.toString();

    return {
      paymentIntentId: intent.id,
      paymentAttemptId: attemptId,
      method: input.method,
      gatewayInput: {
        merchantReference,
        // On a retry the intent's already-stored amount is authoritative — a
        // different amount sent the second time must never reach the gateway.
        amount: input.existingPaymentIntentId ? (intent.amount?.toFixed(2) ?? input.amount) : input.amount,
        currency: input.currency,
        customer: input.customer,
        expiresAt: input.expiresAt,
        walletMobileNumber: input.walletMobileNumber,
      },
    };
  }

  /**
   * The live network call — no `tx` parameter on purpose. Call this AFTER
   * the `prepare()` transaction has committed and BEFORE the
   * `completeSuccess`/`completeFailure` transaction, never from inside
   * either.
   */
  async callGateway(prepared: PreparedOnlinePayment): Promise<CompletedOnlinePayment> {
    const { method, gatewayInput } = prepared;

    if (method === 'CARD') {
      const result = await this.gateway.initiateCardPayment(gatewayInput);
      return { metadata: result as unknown as Prisma.InputJsonValue, redirectUrl: result.redirectUrl };
    }

    if (method === 'FAWRY') {
      const result = await this.fawryGateway.initiatePayment(gatewayInput);
      return { metadata: result as unknown as Prisma.InputJsonValue, referenceCode: result.referenceCode };
    }

    // MOBILE_WALLET: Fawry MWALLET Request-to-Pay. The DTO already requires a
    // valid number; this guard covers any other caller. The response carries
    // no redirect — the patient approves in their wallet app, and the payment
    // only counts once a verified Fawry notification says PAID.
    if (!gatewayInput.walletMobileNumber) {
      throw new DomainError(400, 'WALLET_INFO_REQUIRED', 'أدخل رقم الهاتف المرتبط بالمحفظة الإلكترونية.');
    }
    const result = await this.fawryGateway.initiateMobileWalletPayment({
      ...gatewayInput,
      debitMobileWalletNo: gatewayInput.walletMobileNumber,
    });
    return { metadata: result as unknown as Prisma.InputJsonValue, referenceCode: result.referenceCode };
  }

  async completeSuccess(tx: Prisma.TransactionClient, paymentAttemptId: string, metadata: Prisma.InputJsonValue): Promise<void> {
    await this.paymentAttempts.updateStatus(tx, paymentAttemptId, 'INITIATED', { metadata });
  }

  /** File 11 Part 13: a failed attempt doesn't fail the intent — leave it `CREATED` so the client can retry (`existingPaymentIntentId`) until the hold expires. */
  async completeFailure(tx: Prisma.TransactionClient, paymentAttemptId: string): Promise<void> {
    await this.paymentAttempts.updateStatus(tx, paymentAttemptId, 'FAILED', { failureCode: 'GATEWAY_INITIATE_FAILED' });
  }

  private async loadRetryableIntent(tx: Prisma.TransactionClient, paymentIntentId: string) {
    const intent = await this.paymentIntents.findById(tx, paymentIntentId);
    if (!intent || intent.status !== 'CREATED') {
      throw new BusinessRuleError('PAYMENT_INTENT_NOT_RETRYABLE', 'لا يمكن إعادة محاولة هذه الدفعة.', { paymentIntentId });
    }
    return intent;
  }
}
