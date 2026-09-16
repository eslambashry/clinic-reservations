import { Injectable } from '@nestjs/common';
import { Prisma, Refund, RefundStatus } from '@prisma/client';

export interface NewRefund {
  paymentIntentId: string;
  amount: string;
  reason?: string;
  status: RefundStatus;
}

@Injectable()
export class RefundRepository {
  create(db: Prisma.TransactionClient, input: NewRefund): Promise<Refund> {
    return db.refund.create({
      data: {
        payment_intent_id: input.paymentIntentId,
        amount: input.amount,
        reason: input.reason,
        status: input.status,
      },
    });
  }

  /**
   * Only `COMPLETED` refunds count toward the finance summary — a
   * `REQUESTED`/`PROCESSING`/`FAILED` row is money that never left the platform, so
   * including it would overstate refunds against real commission/provider
   * totals.
   */
  async sumCompleted(db: Prisma.TransactionClient, filter: { from?: Date; to?: Date }): Promise<Prisma.Decimal> {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filter.from) {
      createdAt.gte = filter.from;
    }
    if (filter.to) {
      createdAt.lte = filter.to;
    }

    const result = await db.refund.aggregate({
      where: {
        status: RefundStatus.COMPLETED,
        ...(filter.from || filter.to ? { created_at: createdAt } : {}),
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? new Prisma.Decimal(0);
  }
}
