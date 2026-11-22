import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { WithdrawalRequestRepository } from '../infrastructure/withdrawal-request.repository';
import { ReturnWithdrawalToWalletUseCase } from './return-withdrawal-to-wallet.use-case';
import { toWithdrawalView, WithdrawalView } from './withdrawal.mapper';

/** Patient side: `GET /v1/wallet/withdrawals` and `POST /v1/wallet/withdrawals/:id/cancel`. */
@Injectable()
export class ManageMyWithdrawalsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WithdrawalRequestRepository) private readonly withdrawals: WithdrawalRequestRepository,
    @Inject(ReturnWithdrawalToWalletUseCase) private readonly returnToWallet: ReturnWithdrawalToWalletUseCase,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async list(userId: string): Promise<{ items: WithdrawalView[] }> {
    const rows = await this.withdrawals.listByPatient(this.prisma, userId, 50);
    return { items: rows.map((row) => toWithdrawalView(row, (url) => this.mediaStorage.getSignedUrl(url))) };
  }

  /** Cancel is only possible while PENDING; the amount returns to the wallet as its own ledger row. */
  async cancel(userId: string, withdrawalId: string): Promise<WithdrawalView> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const request = await this.withdrawals.findById(tx, withdrawalId);
      if (!request || request.patient_user_id !== userId) {
        throw new NotFoundError('WithdrawalRequest', withdrawalId);
      }
      const resolved = await this.withdrawals.resolvePending(tx, request.id, { status: 'CANCELLED', cancelledAt: new Date() });
      if (!resolved) {
        throw new BusinessRuleError('WITHDRAWAL_NOT_PENDING', 'لا يمكن إلغاء هذا الطلب لأنه تمت معالجته بالفعل.');
      }
      await this.returnToWallet.execute(tx, request);
      return (await this.withdrawals.findById(tx, request.id))!;
    });
    return toWithdrawalView(cancelled, (url) => this.mediaStorage.getSignedUrl(url));
  }
}
