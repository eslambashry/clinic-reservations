import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';

/**
 * File 12 Part 50.5: called by `ExpireHoldsUseCase` (scheduling-appointments)
 * when a hold with an in-flight online payment expires — moves the
 * still-`CREATED` intent to `CANCELLED` so a webhook arriving afterward
 * (Part 50.6's late-payment race) finds a definitively terminal, non-`CREATED`
 * intent and knows not to attempt a normal capture.
 */
@Injectable()
export class CancelOnlinePaymentIntentUseCase {
  constructor(@Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository) {}

  async execute(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
    const intent = await this.paymentIntents.findById(tx, paymentIntentId);
    if (intent) {
      await this.paymentIntents.markCancelled(tx, intent.id, intent.version);
    }
  }
}
