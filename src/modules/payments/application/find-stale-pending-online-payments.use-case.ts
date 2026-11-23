import { Inject, Injectable } from '@nestjs/common';
import { PayableType } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';

export interface StalePendingOnlinePayment {
  paymentIntentId: string;
  payableType: PayableType;
  createdAt: Date;
  /** Latest attempt (its id is the Paymob merchant reference); null when the intent has no attempt. */
  attempt: { id: string; status: 'INITIATED' | 'SUCCEEDED' | 'FAILED'; gatewayReference: string | null } | null;
}

export interface FindStalePendingOnlinePaymentsInput {
  payableTypes: PayableType[];
  olderThan: Date;
  newerThan?: Date;
  requireInitiatedAttempt: boolean;
  limit: number;
}

/** Exposes "online CARD intents still CREATED past a threshold" to the reconciliation/cleanup jobs without leaking the repository. */
@Injectable()
export class FindStalePendingOnlinePaymentsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
  ) {}

  async execute(input: FindStalePendingOnlinePaymentsInput): Promise<StalePendingOnlinePayment[]> {
    const rows = await this.paymentIntents.findStalePendingOnline(this.prisma as any, input);
    return rows.map((row) => {
      const attempt = row.payment_attempts[0];
      return {
        paymentIntentId: row.id,
        payableType: row.payable_type,
        createdAt: row.created_at,
        attempt: attempt ? { id: attempt.id, status: attempt.status, gatewayReference: attempt.gateway_reference } : null,
      };
    });
  }
}
