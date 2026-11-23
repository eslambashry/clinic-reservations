import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptRepository } from '../infrastructure/payment-attempt.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

export const STALE_TOPUP_FAILURE_REASON = 'EXPIRED_ABANDONED';

/**
 * Abandons a stale PENDING wallet top-up: intent `CREATED→CANCELLED` (version-guarded), the
 * `WalletTransaction` `PENDING→FAILED`, and any unresolved attempt `FAILED`. Never credits anything.
 * Callers must have reconciled with the gateway first. Returns `false` if the intent already moved
 * (e.g. captured by a late webhook) - then nothing is touched.
 */
@Injectable()
export class ExpireStaleWalletTopUpUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(PaymentAttemptRepository) private readonly paymentAttempts: PaymentAttemptRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<boolean> {
    const intent = await this.paymentIntents.findById(tx, paymentIntentId);
    if (!intent || intent.payable_type !== 'WALLET_TOPUP' || intent.status !== 'CREATED') {
      return false;
    }
    const cancelled = await this.paymentIntents.markCancelled(tx, intent.id, intent.version);
    if (!cancelled) {
      return false;
    }
    const walletTransaction = await this.walletTransactions.findByPaymentIntentId(tx, intent.id);
    if (walletTransaction) {
      await this.walletTransactions.markFailed(tx, walletTransaction.id, STALE_TOPUP_FAILURE_REASON);
    }
    const attempt = await this.paymentAttempts.findLatestByPaymentIntentId(tx, intent.id);
    if (attempt && attempt.status === 'INITIATED') {
      await this.paymentAttempts.updateStatus(tx, attempt.id, 'FAILED', { failureCode: STALE_TOPUP_FAILURE_REASON });
    }
    return true;
  }
}
