import { Injectable } from '@nestjs/common';
import { PayeeType, PaymentSplit, Prisma, SplitType } from '@prisma/client';

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
}
