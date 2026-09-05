import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptRepository } from '../infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

export interface MarkOnlinePaymentFailedInput {
  paymentAttemptId: string;
  paymentIntentId: string;
  failureCode: string;
}

/**
 * File 11 Part 13: a failed attempt does NOT fail the intent — it stays
 * `CREATED` so the client can retry (`InitiateOnlinePaymentUseCase`'s
 * `existingPaymentIntentId` path) until the hold expires (at which point
 * `ExpireHoldsUseCase` cancels the intent). For a `WALLET_TOPUP` payable,
 * also marks the associated `WalletTransaction` `FAILED` — there's no hold
 * to fall back on for that payable type, so the transaction row itself is
 * the only place a failure needs to be recorded.
 */
@Injectable()
export class MarkOnlinePaymentFailedUseCase {
  constructor(
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: MarkOnlinePaymentFailedInput): Promise<void> {
    await this.paymentAttempts.updateStatus(tx, input.paymentAttemptId, 'FAILED', { failureCode: input.failureCode });

    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (intent?.payable_type === 'WALLET_TOPUP') {
      const walletTransaction = await this.walletTransactions.findByPaymentIntentId(tx, intent.id);
      if (walletTransaction) {
        await this.walletTransactions.markFailed(tx, walletTransaction.id, input.failureCode);
      }
    }
  }
}
