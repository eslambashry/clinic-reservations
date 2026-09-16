import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PaymentSplitRepository } from '../infrastructure/payment-split.repository';
import { RefundRepository } from '../infrastructure/refund.repository';

export interface GetFinanceSummaryInput {
  from?: string;
  to?: string;
}

export interface FinanceSummary {
  /** Fixed 2-decimal string — `Prisma.Decimal#toString()` drops trailing zeros (e.g. "10" for 10.00 EGP), which is not how a money amount should ever reach a client. */
  commissionTotal: string;
  providerShareTotal: string;
  refundTotal: string;
  currency: string;
}

/**
 * File 11 Part 13 platform finance roll-up — `payment_splits` and `refunds`
 * have accumulated since pay-at-clinic capture shipped with nothing reading
 * them. ADMIN-only.
 *
 * Currency is reported as the single MVP launch currency rather than being
 * grouped: `payment_splits`/`refunds` carry no currency column of their own
 * (it lives on `payment_intents`), and the platform is single-currency
 * today (R15 keeps it a separate field so a future multi-currency roll-up
 * is a grouping change here, not a wire-format change).
 */
@Injectable()
export class GetFinanceSummaryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentSplitRepository) private readonly paymentSplits: PaymentSplitRepository,
    @Inject(RefundRepository) private readonly refunds: RefundRepository,
  ) {}

  async execute(input: GetFinanceSummaryInput): Promise<FinanceSummary> {
    const range = {
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
    };

    const [splitTotals, refundTotal] = await Promise.all([
      this.paymentSplits.sumByType(this.prisma, range),
      this.refunds.sumCompleted(this.prisma, range),
    ]);

    const zero = new Prisma.Decimal(0);
    return {
      commissionTotal: (splitTotals.get('COMMISSION') ?? zero).toFixed(2),
      providerShareTotal: (splitTotals.get('PROVIDER_SHARE') ?? zero).toFixed(2),
      refundTotal: refundTotal.toFixed(2),
      currency: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY,
    };
  }
}
