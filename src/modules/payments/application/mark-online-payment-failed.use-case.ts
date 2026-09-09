import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
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
 *
 * Emits `PaymentFailed` (File 11 Part 19's documented event-tier table:
 * TRANSACTIONAL, Push) — the patient needs to know a card/Fawry/wallet
 * attempt failed so they can retry before the hold window runs out; this
 * use-case previously updated the DB with no signal for that at all
 * (File 12 Part 52 gap, fixed here).
 */
@Injectable()
export class MarkOnlinePaymentFailedUseCase {
  constructor(
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
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

    if (intent) {
      await this.outbox.emit(tx, 'PaymentFailed', {
        paymentIntentId: intent.id,
        payerUserId: intent.payer_user_id,
        payableType: intent.payable_type,
        payableId: intent.payable_id,
        method: intent.method,
        failureCode: input.failureCode,
      });
    }
  }
}
