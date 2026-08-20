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
}
