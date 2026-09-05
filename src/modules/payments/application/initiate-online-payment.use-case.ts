import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PayableType, PaymentMethod, Prisma } from '@prisma/client';
import { BusinessRuleError, DomainError } from '../../../shared/core/errors/domain-errors';
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
  walletProvider?: 'VODAFONE_CASH' | 'ETISALAT_CASH' | 'ORANGE_CASH';
  walletMobileNumber?: string;
  /**
   * File 11 Part 13: "a FAILED attempt does not fail the intent — the
   * client may create a new attempt against the same intent, not a new
   * intent, until the hold expires." Pass the still-`CREATED` intent's id
   * to retry instead of creating a duplicate `PaymentIntent`.
   */
  existingPaymentIntentId?: string;
}

export interface InitiateOnlinePaymentResult {
  paymentIntentId: string;
  paymentAttemptId: string;
  method: OnlinePaymentMethod;
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
 * branches on them. Takes `tx` explicitly for the same reason as its
 * pay-at-clinic sibling: the caller (scheduling-appointments, for the
 * appointment case) needs this to commit atomically with its own hold-side
 * writes.
 */
@Injectable()
export class InitiateOnlinePaymentUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: InitiateOnlinePaymentInput): Promise<InitiateOnlinePaymentResult> {
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
        });

    const attemptId = randomUUID();
    // `gateway_reference` is our OWN generated id, sent to the gateway as
    // its "merchant reference" (Part 50 gateway-port doc) — set at creation
    // time, before the gateway even knows this attempt exists, so a webhook
    // can always be correlated back regardless of how/when the gateway
    // assigns its own transaction id.
    await this.paymentAttempts.create(tx, { id: attemptId, paymentIntentId: intent.id, gatewayReference: attemptId });

    const gatewayInput = { merchantReference: attemptId, amount: input.amount, currency: input.currency, customer: input.customer };

    try {
      if (input.method === 'CARD') {
        const result = await this.gateway.initiateCardPayment(gatewayInput);
        await this.paymentAttempts.updateStatus(tx, attemptId, 'INITIATED', { metadata: result as unknown as Prisma.InputJsonValue });
        return { paymentIntentId: intent.id, paymentAttemptId: attemptId, method: input.method, redirectUrl: result.redirectUrl };
      }

      if (input.method === 'FAWRY') {
        const result = await this.gateway.initiateFawryPayment(gatewayInput);
        await this.paymentAttempts.updateStatus(tx, attemptId, 'INITIATED', { metadata: result as unknown as Prisma.InputJsonValue });
        return { paymentIntentId: intent.id, paymentAttemptId: attemptId, method: input.method, referenceCode: result.referenceCode };
      }

      if (!input.walletProvider || !input.walletMobileNumber) {
        throw new DomainError(400, 'WALLET_INFO_REQUIRED', 'اختر مزوّد المحفظة وأدخل رقم الهاتف المرتبط بها.');
      }
      const result = await this.gateway.initiateMobileWalletPayment({
        ...gatewayInput,
        walletProvider: input.walletProvider,
        walletMobileNumber: input.walletMobileNumber,
      });
      await this.paymentAttempts.updateStatus(tx, attemptId, 'INITIATED', { metadata: result as unknown as Prisma.InputJsonValue });
      return { paymentIntentId: intent.id, paymentAttemptId: attemptId, method: input.method, redirectUrl: result.redirectUrl };
    } catch (error) {
      // File 11 Part 13: a failed attempt doesn't fail the intent — leave it
      // `CREATED` so the client can retry (`existingPaymentIntentId`) until
      // the hold expires.
      await this.paymentAttempts.updateStatus(tx, attemptId, 'FAILED', { failureCode: 'GATEWAY_INITIATE_FAILED' });
      throw error;
    }
  }

  private async loadRetryableIntent(tx: Prisma.TransactionClient, paymentIntentId: string) {
    const intent = await this.paymentIntents.findById(tx, paymentIntentId);
    if (!intent || intent.status !== 'CREATED') {
      throw new BusinessRuleError('PAYMENT_INTENT_NOT_RETRYABLE', 'لا يمكن إعادة محاولة هذه الدفعة.', { paymentIntentId });
    }
    return intent;
  }
}
