import { Inject, Injectable } from '@nestjs/common';
import { Prisma, WithdrawalRequest } from '@prisma/client';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';

/** Credits a rejected/cancelled withdrawal back to the wallet as its own `WITHDRAWAL_REFUND` ledger row (never by editing the original row). */
@Injectable()
export class ReturnWithdrawalToWalletUseCase {
  constructor(
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, withdrawal: WithdrawalRequest): Promise<void> {
    const wallet = await this.wallets.credit(tx, withdrawal.wallet_id, withdrawal.amount.toFixed(2));
    await this.walletTransactions.create(tx, {
      walletId: wallet.id,
      type: 'WITHDRAWAL_REFUND',
      status: 'COMPLETED',
      amount: withdrawal.amount.toFixed(2),
      resultingBalance: wallet.balance.toFixed(2),
      withdrawalRequestId: withdrawal.id,
    });
  }
}
