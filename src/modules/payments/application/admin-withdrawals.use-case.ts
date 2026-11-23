import { Inject, Injectable } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { MEDIA_STORAGE, MediaStoragePort, UploadedMediaFile } from '../../../shared/kernel/storage/media-storage.port';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WithdrawalRequestRepository, WithdrawalWithPatient } from '../infrastructure/withdrawal-request.repository';
import { ReturnWithdrawalToWalletUseCase } from './return-withdrawal-to-wallet.use-case';
import { toWithdrawalView, WithdrawalView } from './withdrawal.mapper';

export interface AdminWithdrawalView extends WithdrawalView {
  patient: { id: string; name: string; phone: string };
  /** The patient's CURRENT wallet balance (the withdrawn amount is already debited from it). */
  walletBalance: string;
}

function patientName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter((part): part is string => !!part).join(' ');
}

/** Admin side of manual withdrawals: list / detail / complete (proof upload) / reject. */
@Injectable()
export class AdminWithdrawalsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WithdrawalRequestRepository) private readonly withdrawals: WithdrawalRequestRepository,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(ReturnWithdrawalToWalletUseCase) private readonly returnToWallet: ReturnWithdrawalToWalletUseCase,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
  ) {}

  async list(params: { status?: WithdrawalStatus; limit?: number }): Promise<{ items: AdminWithdrawalView[] }> {
    const rows = await this.withdrawals.listForAdmin(this.prisma, { status: params.status, limit: params.limit ?? 100 });
    const items = await Promise.all(rows.map((row) => this.toAdminView(row)));
    return { items };
  }

  async get(id: string): Promise<AdminWithdrawalView> {
    const row = await this.withdrawals.findByIdWithPatient(this.prisma, id);
    if (!row) {
      throw new NotFoundError('WithdrawalRequest', id);
    }
    return this.toAdminView(row);
  }

  /** Proof is uploaded first (private storage; an external round trip must not hold a DB transaction), then the PENDING -> COMPLETED transition commits. */
  async complete(id: string, proof: UploadedMediaFile, actor: AccessTokenPayload): Promise<AdminWithdrawalView> {
    const existing = await this.withdrawals.findById(this.prisma, id);
    if (!existing) {
      throw new NotFoundError('WithdrawalRequest', id);
    }
    if (existing.status !== 'PENDING') {
      throw new BusinessRuleError('WITHDRAWAL_NOT_PENDING', 'تمت معالجة هذا الطلب بالفعل.');
    }

    const stored = await this.mediaStorage.upload(proof, { folder: `withdrawal-proofs/${existing.patient_user_id}`, isPrivate: true });

    await this.prisma.$transaction(async (tx) => {
      const resolved = await this.withdrawals.resolvePending(tx, id, {
        status: 'COMPLETED',
        proofFileUrl: stored.url,
        processedByUserId: actor.sub,
        processedAt: new Date(),
      });
      if (!resolved) {
        throw new BusinessRuleError('WITHDRAWAL_NOT_PENDING', 'تمت معالجة هذا الطلب بالفعل.');
      }
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'payments.withdrawal.complete',
        resourceType: 'withdrawal_request',
        resourceId: id,
        subjectPatientId: existing.patient_user_id,
      });
      await this.outbox.emit(tx, 'WithdrawalCompleted', {
        withdrawalId: id,
        userId: existing.patient_user_id,
        amount: existing.amount.toFixed(2),
      });
    });
    return this.get(id);
  }

  async reject(id: string, reason: string, actor: AccessTokenPayload): Promise<AdminWithdrawalView> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.withdrawals.findById(tx, id);
      if (!request) {
        throw new NotFoundError('WithdrawalRequest', id);
      }
      const resolved = await this.withdrawals.resolvePending(tx, id, {
        status: 'REJECTED',
        rejectReason: reason,
        processedByUserId: actor.sub,
        processedAt: new Date(),
      });
      if (!resolved) {
        throw new BusinessRuleError('WITHDRAWAL_NOT_PENDING', 'تمت معالجة هذا الطلب بالفعل.');
      }
      await this.returnToWallet.execute(tx, request);
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'payments.withdrawal.reject',
        resourceType: 'withdrawal_request',
        resourceId: id,
        subjectPatientId: request.patient_user_id,
        reasonCode: 'WITHDRAWAL_REJECTED',
      });
      await this.outbox.emit(tx, 'WithdrawalRejected', {
        withdrawalId: id,
        userId: request.patient_user_id,
        amount: request.amount.toFixed(2),
        reason,
      });
    });
    return this.get(id);
  }

  private async toAdminView(row: WithdrawalWithPatient): Promise<AdminWithdrawalView> {
    const wallet = await this.wallets.findById(this.prisma, row.wallet_id);
    return {
      ...toWithdrawalView(row, (url) => this.mediaStorage.getSignedUrl(url)),
      patient: { id: row.patient.id, name: patientName(row.patient), phone: row.patient.phone },
      walletBalance: wallet ? wallet.balance.toFixed(2) : '0.00',
    };
  }
}
