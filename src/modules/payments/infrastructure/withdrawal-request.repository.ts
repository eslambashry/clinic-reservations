import { Injectable } from '@nestjs/common';
import { Prisma, WithdrawalPayoutMethod, WithdrawalRequest, WithdrawalStatus } from '@prisma/client';

export interface NewWithdrawalRequest {
  id: string;
  patientUserId: string;
  walletId: string;
  amount: string;
  accountHolderName: string;
  payoutMethod: WithdrawalPayoutMethod;
  payoutAccount: string;
}

export type WithdrawalWithPatient = Prisma.WithdrawalRequestGetPayload<{
  include: { patient: { select: { id: true; first_name: true; last_name: true; phone: true } } };
}>;

@Injectable()
export class WithdrawalRequestRepository {
  create(db: Prisma.TransactionClient, input: NewWithdrawalRequest): Promise<WithdrawalRequest> {
    return db.withdrawalRequest.create({
      data: {
        id: input.id,
        patient_user_id: input.patientUserId,
        wallet_id: input.walletId,
        amount: input.amount,
        account_holder_name: input.accountHolderName,
        payout_method: input.payoutMethod,
        payout_account: input.payoutAccount,
        status: 'PENDING',
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<WithdrawalRequest | null> {
    return db.withdrawalRequest.findUnique({ where: { id } });
  }

  findByIdWithPatient(db: Prisma.TransactionClient, id: string): Promise<WithdrawalWithPatient | null> {
    return db.withdrawalRequest.findUnique({
      where: { id },
      include: { patient: { select: { id: true, first_name: true, last_name: true, phone: true } } },
    });
  }

  listByPatient(db: Prisma.TransactionClient, patientUserId: string, limit: number): Promise<WithdrawalRequest[]> {
    return db.withdrawalRequest.findMany({
      where: { patient_user_id: patientUserId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  listForAdmin(db: Prisma.TransactionClient, params: { status?: WithdrawalStatus; limit: number }): Promise<WithdrawalWithPatient[]> {
    return db.withdrawalRequest.findMany({
      where: params.status ? { status: params.status } : undefined,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: params.limit,
      include: { patient: { select: { id: true, first_name: true, last_name: true, phone: true } } },
    });
  }

  /**
   * Conditional `PENDING -> <terminal>` transition (single UPDATE ... WHERE status='PENDING'):
   * `false` means a concurrent cancel/complete/reject already resolved it.
   */
  async resolvePending(
    db: Prisma.TransactionClient,
    id: string,
    data: {
      status: Exclude<WithdrawalStatus, 'PENDING'>;
      proofFileUrl?: string;
      rejectReason?: string;
      processedByUserId?: string;
      processedAt?: Date;
      cancelledAt?: Date;
    },
  ): Promise<boolean> {
    const result = await db.withdrawalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: data.status,
        proof_file_url: data.proofFileUrl,
        reject_reason: data.rejectReason,
        processed_by_user_id: data.processedByUserId,
        processed_at: data.processedAt,
        cancelled_at: data.cancelledAt,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  async sumByStatus(db: Prisma.TransactionClient, status: WithdrawalStatus, range: { from?: Date; to?: Date }): Promise<Prisma.Decimal> {
    const result = await db.withdrawalRequest.aggregate({
      _sum: { amount: true },
      where: { status, ...(range.from || range.to ? { created_at: { gte: range.from, lte: range.to } } : {}) },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }
}
