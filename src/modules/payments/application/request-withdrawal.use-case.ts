import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, WithdrawalPayoutMethod } from '@prisma/client';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ServiceFeeReader } from '../../../shared/kernel/policy-config/service-fee.reader';
import { computeMinWithdrawal, normalizePayoutAccount } from '../domain/withdrawal.rules';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';
import { WithdrawalRequestRepository } from '../infrastructure/withdrawal-request.repository';
import { toWithdrawalView, WithdrawalView } from './withdrawal.mapper';

export interface RequestWithdrawalInput {
  userId: string;
  amount: string;
  accountHolderName: string;
  payoutMethod: WithdrawalPayoutMethod;
  payoutAccount: string;
}

/**
 * `POST /v1/wallet/withdrawals`. Rules: amount <= balance, amount >= current
 * service fee (auto minimum), one PENDING request per patient (the DB partial
 * unique index is the real guard). The balance is debited immediately, in the
 * same transaction that creates the request, with the same conditional
 * `UPDATE ... WHERE balance >= amount` every wallet debit uses.
 */
@Injectable()
export class RequestWithdrawalUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(WithdrawalRequestRepository) private readonly withdrawals: WithdrawalRequestRepository,
    @Inject(ServiceFeeReader) private readonly serviceFee: ServiceFeeReader,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async execute(input: RequestWithdrawalInput): Promise<WithdrawalView> {
    const payoutAccount = normalizePayoutAccount(input.payoutMethod, input.payoutAccount);
    if (!payoutAccount) {
      throw new BusinessRuleError(
        'WITHDRAWAL_PAYOUT_ACCOUNT_INVALID',
        input.payoutMethod === 'IBAN' ? 'رقم الحساب (IBAN) غير صالح.' : 'رقم المحفظة الإلكترونية غير صالح.',
      );
    }
    if (!(Number(input.amount) > 0)) {
      throw new BusinessRuleError('WITHDRAWAL_AMOUNT_INVALID', 'مبلغ السحب غير صالح.');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const fee = await this.serviceFee.get(tx);
      const minAmount = computeMinWithdrawal(fee.amount);
      if (Number(input.amount) < Number(minAmount)) {
        throw new BusinessRuleError('WITHDRAWAL_BELOW_MINIMUM', `الحد الأدنى للسحب هو ${minAmount} ${fee.currency}.`, { minAmount });
      }

      const wallet = await this.wallets.getOrCreate(tx, input.userId, fee.currency);
      const id = randomUUID();
      const amount = Number(input.amount).toFixed(2);

      const request = await this.withdrawals
        .create(tx, {
          id,
          patientUserId: input.userId,
          walletId: wallet.id,
          amount,
          accountHolderName: input.accountHolderName.trim(),
          payoutMethod: input.payoutMethod,
          payoutAccount,
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new BusinessRuleError('WITHDRAWAL_ALREADY_PENDING', 'لديك طلب سحب قيد المراجعة بالفعل. انتظر معالجته أو ألغه أولًا.');
          }
          throw error;
        });

      const debited = await this.wallets.debit(tx, wallet.id, amount);
      if (!debited) {
        throw new BusinessRuleError('INSUFFICIENT_WALLET_BALANCE', 'مبلغ السحب أكبر من رصيد المحفظة.', { required: amount });
      }
      const after = await this.wallets.findById(tx, wallet.id);

      await this.walletTransactions.create(tx, {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        amount,
        resultingBalance: after!.balance.toFixed(2),
        withdrawalRequestId: request.id,
      });

      return request;
    });

    return toWithdrawalView(row, (url) => this.mediaStorage.getSignedUrl(url));
  }
}
