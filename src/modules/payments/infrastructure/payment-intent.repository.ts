import { Injectable } from '@nestjs/common';
import { PayableType, PaymentIntent, Prisma } from '@prisma/client';

export interface NewPaymentIntent {
  payerUserId: string;
  payableType: PayableType;
  payableId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
}

@Injectable()
export class PaymentIntentRepository {
  create(db: Prisma.TransactionClient, input: NewPaymentIntent): Promise<PaymentIntent> {
    return db.paymentIntent.create({
      data: {
        payer_user_id: input.payerUserId,
        payable_type: input.payableType,
        payable_id: input.payableId,
        amount: input.amount,
        currency: input.currency,
        idempotency_key: input.idempotencyKey,
        status: 'CREATED',
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<PaymentIntent | null> {
    return db.paymentIntent.findUnique({ where: { id } });
  }

  /** Version-guarded `CREATED→CAPTURED`; `false` means a concurrent writer already moved this intent. */
  async markCaptured(db: Prisma.TransactionClient, id: string, currentVersion: number): Promise<boolean> {
    const result = await db.paymentIntent.updateMany({
      where: { id, version: currentVersion, status: 'CREATED' },
      data: { status: 'CAPTURED', version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Version-guarded `CAPTURED→(REFUNDED|PARTIALLY_REFUNDED)`; `false` means a concurrent writer already moved this intent. */
  async markRefunded(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'REFUNDED' | 'PARTIALLY_REFUNDED',
  ): Promise<boolean> {
    const result = await db.paymentIntent.updateMany({
      where: { id, version: currentVersion, status: 'CAPTURED' },
      data: { status, version: { increment: 1 } },
    });
    return result.count === 1;
  }
}
