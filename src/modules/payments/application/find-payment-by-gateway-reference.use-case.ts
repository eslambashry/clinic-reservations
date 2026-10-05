import { Inject, Injectable } from '@nestjs/common';
import { PayableType, PaymentAttempt, PaymentIntentStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PaymentAttemptRepository } from '../infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';

export interface PaymentLookupResult {
  paymentAttemptId: string;
  paymentIntentId: string;
  payerUserId: string;
  payableType: PayableType;
  payableId: string;
  intentStatus: PaymentIntentStatus;
  method: PaymentMethod;
  amount: string;
  /** Full price `amount` is a partial payment toward, when the intent was created that way; `null` = `amount` is the whole price. */
  fullAmount: string | null;
  currency: string;
}

/** Which gateway sent the reference — they key attempts differently (File 12 Part 55). */
export type GatewayProvider = 'paymob' | 'fawry';

const NUMERIC_REFERENCE = /^\d{1,18}$/;

/**
 * File 12 Part 50: the webhook controller's only way to go from "a gateway
 * reference we don't yet trust" to "our own payment records" — deliberately
 * exported instead of the raw repositories (File 12 Part 05: callers reach a
 * module only through its application-layer use-cases, never its
 * `infrastructure/`).
 *
 * File 12 Part 55: Paymob echoes the attempt's UUID `gateway_reference`;
 * Fawry echoes the numeric `fawry_merchant_ref_num`. A non-numeric Fawry
 * reference can only be an attempt created before Part 55 (which sent the
 * UUID to Fawry), so it falls back to the legacy `gateway_reference` lookup
 * and those in-flight payments still settle.
 */
@Injectable()
export class FindPaymentByGatewayReferenceUseCase {
  constructor(
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, gatewayReference: string, provider: GatewayProvider): Promise<PaymentLookupResult | null> {
    const attempt = await this.findAttempt(tx, gatewayReference, provider);
    if (!attempt) {
      return null;
    }
    const intent = await this.paymentIntents.findById(tx, attempt.payment_intent_id);
    if (!intent) {
      return null;
    }

    return {
      paymentAttemptId: attempt.id,
      paymentIntentId: intent.id,
      payerUserId: intent.payer_user_id,
      payableType: intent.payable_type,
      payableId: intent.payable_id,
      intentStatus: intent.status,
      method: intent.method,
      amount: intent.amount.toString(),
      fullAmount: intent.full_amount ? intent.full_amount.toFixed(2) : null,
      currency: intent.currency,
    };
  }

  private findAttempt(tx: Prisma.TransactionClient, gatewayReference: string, provider: GatewayProvider): Promise<PaymentAttempt | null> {
    if (provider === 'fawry' && NUMERIC_REFERENCE.test(gatewayReference)) {
      return this.paymentAttempts.findByFawryMerchantRefNum(tx, BigInt(gatewayReference));
    }
    return this.paymentAttempts.findByGatewayReference(tx, gatewayReference);
  }
}
