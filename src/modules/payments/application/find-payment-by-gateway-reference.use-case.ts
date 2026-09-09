import { Inject, Injectable } from '@nestjs/common';
import { PayableType, PaymentIntentStatus, PaymentMethod, Prisma } from '@prisma/client';
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
  currency: string;
}

/**
 * File 12 Part 50: the webhook controller's only way to go from "a gateway
 * reference we don't yet trust" to "our own payment records" — deliberately
 * exported instead of the raw repositories (File 12 Part 05: callers reach a
 * module only through its application-layer use-cases, never its
 * `infrastructure/`).
 */
@Injectable()
export class FindPaymentByGatewayReferenceUseCase {
  constructor(
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, gatewayReference: string): Promise<PaymentLookupResult | null> {
    const attempt = await this.paymentAttempts.findByGatewayReference(tx, gatewayReference);
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
      currency: intent.currency,
    };
  }
}
