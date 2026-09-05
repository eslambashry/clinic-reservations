import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

export interface ProcessWalletTopUpInput {
  paymentIntentId: string;
}

export interface ProcessWalletTopUpResult {
  walletId: string;
  newBalance: string;
}

/**
 * File 12 Part 50.3/50.4 — the ONLY place a wallet top-up is credited: after
 * the funding `PaymentIntent` (method `CARD`, payable type `WALLET_TOPUP`)
 * is verified captured by a signed gateway webhook. "Do not simply increase
 * the wallet balance before the payment is confirmed" (business
 * requirement) is enforced structurally here — there is no other code path
 * that calls `WalletRepository.credit`.
 *
 * Idempotent by construction: `paymentIntents.markCaptured` is a
 * version-guarded `CREATED→CAPTURED` transition (`false` on a second call),
 * so a duplicate webhook delivery (already filtered once by the
 * `webhook_events` idempotency-key insert, File 11 Part 11's documented
 * mechanism) hits this as a defense-in-depth no-op rather than a second
 * credit — it returns the wallet's current balance instead of crediting
 * again.
 */
@Injectable()
export class ProcessWalletTopUpUseCase {
  constructor(
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: ProcessWalletTopUpInput): Promise<ProcessWalletTopUpResult> {
    const intent = await this.paymentIntents.findById(tx, input.paymentIntentId);
    if (!intent) {
      throw new NotFoundError('PaymentIntent', input.paymentIntentId);
    }

    const walletTransaction = await this.walletTransactions.findByPaymentIntentId(tx, intent.id);
    if (!walletTransaction) {
      throw new NotFoundError('WalletTransaction', intent.payable_id);
    }

    if (intent.status !== 'CREATED') {
      // Duplicate webhook — already captured (or otherwise resolved) by an
      // earlier delivery. Report the wallet's current balance rather than
      // crediting a second time.
      const wallet = await this.wallets.findById(tx, walletTransaction.wallet_id);
      return { walletId: walletTransaction.wallet_id, newBalance: wallet?.balance.toFixed(2) ?? '0.00' };
    }

    const captured = await this.paymentIntents.markCaptured(tx, intent.id, intent.version);
    if (!captured) {
      const wallet = await this.wallets.findById(tx, walletTransaction.wallet_id);
      return { walletId: walletTransaction.wallet_id, newBalance: wallet?.balance.toFixed(2) ?? '0.00' };
    }

    const wallet = await this.wallets.credit(tx, walletTransaction.wallet_id, intent.amount.toString());
    await this.walletTransactions.markCompleted(tx, walletTransaction.id, wallet.balance.toFixed(2));

    await this.outbox.emit(tx, 'WalletToppedUp', {
      walletId: wallet.id,
      userId: wallet.user_id,
      amount: intent.amount.toString(),
      newBalance: wallet.balance.toFixed(2),
    });

    return { walletId: wallet.id, newBalance: wallet.balance.toFixed(2) };
  }
}
