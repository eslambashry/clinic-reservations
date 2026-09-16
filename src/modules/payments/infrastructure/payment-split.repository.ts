import { Injectable } from '@nestjs/common';
import { PayeeType, PaymentSplit, Prisma, SplitType } from '@prisma/client';

export interface SplitTotalsFilter {
  from?: Date;
  to?: Date;
}

export interface NewPaymentSplit {
  paymentIntentId: string;
  payeeType: PayeeType;
  payeeId?: string;
  amount: string;
  type: SplitType;
}

@Injectable()
export class PaymentSplitRepository {
  create(db: Prisma.TransactionClient, input: NewPaymentSplit): Promise<PaymentSplit> {
    return db.paymentSplit.create({
      data: {
        payment_intent_id: input.paymentIntentId,
        payee_type: input.payeeType,
        payee_id: input.payeeId,
        amount: input.amount,
        type: input.type,
      },
    });
  }

  /**
   * Summed in the database rather than by paging rows into memory: the
   * finance summary is an unbounded aggregate over every split ever
   * written, which is exactly the shape `groupBy` exists for. Returns
   * `Prisma.Decimal` so the caller — not this layer — decides the wire
   * format (`toFixed(2)`, never `toString()`, which drops trailing zeros).
   */
  async sumByType(db: Prisma.TransactionClient, filter: SplitTotalsFilter): Promise<Map<SplitType, Prisma.Decimal>> {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filter.from) {
      createdAt.gte = filter.from;
    }
    if (filter.to) {
      createdAt.lte = filter.to;
    }

    const rows = await db.paymentSplit.groupBy({
      by: ['type'],
      where: filter.from || filter.to ? { created_at: createdAt } : {},
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.type, row._sum.amount ?? new Prisma.Decimal(0)]));
  }
}
