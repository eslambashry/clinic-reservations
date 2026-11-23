import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PaymentSplitRepository } from '../infrastructure/payment-split.repository';
import { PaymentIntentRepository } from '../infrastructure/payment-intent.repository';
import { RefundRepository } from '../infrastructure/refund.repository';
import { WalletRepository } from '../infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../infrastructure/wallet-transaction.repository';
import { WithdrawalRequestRepository } from '../infrastructure/withdrawal-request.repository';

export interface GetFinanceSummaryInput {
  from?: string;
  to?: string;
}

export interface FinanceSummary {
  /** Fixed 2-decimal string — `Prisma.Decimal#toString()` drops trailing zeros (e.g. "10" for 10.00 EGP), which is not how a money amount should ever reach a client. */
  // DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
  // commissionTotal: string;
  // providerShareTotal: string;
  /** Service fees collected (captured, not refunded). */
  serviceFeeTotal: string;
  /** SUM(wallets.balance) at this moment - what the platform owes patients (not date-filtered). */
  walletBalancesTotal: string;
  /** Completed top-ups in range. */
  topUpTotal: string;
  /** Withdrawal requests still PENDING (already debited from wallets). */
  pendingWithdrawalsTotal: string;
  completedWithdrawalsTotal: string;
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
    @Inject(PaymentIntentRepository) private readonly paymentIntents: PaymentIntentRepository,
    @Inject(WalletRepository) private readonly wallets: WalletRepository,
    @Inject(WalletTransactionRepository) private readonly walletTransactions: WalletTransactionRepository,
    @Inject(WithdrawalRequestRepository) private readonly withdrawals: WithdrawalRequestRepository,
  ) {}

  async execute(input: GetFinanceSummaryInput): Promise<FinanceSummary> {
    const range = {
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
    };

    // DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
    // const splitTotals = await this.paymentSplits.sumByType(this.prisma, range);
    const [refundTotal, serviceFeeTotal, walletBalancesTotal, topUpTotal, pendingWithdrawals, completedWithdrawals] = await Promise.all([
      this.refunds.sumCompleted(this.prisma, range),
      this.paymentIntents.sumCapturedAppointmentFees(this.prisma, range),
      this.wallets.sumBalances(this.prisma),
      this.walletTransactions.sumCompletedTopUps(this.prisma, range),
      this.withdrawals.sumByStatus(this.prisma, 'PENDING', range),
      this.withdrawals.sumByStatus(this.prisma, 'COMPLETED', range),
    ]);

    return {
      // DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
      // commissionTotal: (splitTotals.get('COMMISSION') ?? zero).toFixed(2),
      // providerShareTotal: (splitTotals.get('PROVIDER_SHARE') ?? zero).toFixed(2),
      serviceFeeTotal: serviceFeeTotal.toFixed(2),
      walletBalancesTotal: walletBalancesTotal.toFixed(2),
      topUpTotal: topUpTotal.toFixed(2),
      pendingWithdrawalsTotal: pendingWithdrawals.toFixed(2),
      completedWithdrawalsTotal: completedWithdrawals.toFixed(2),
      refundTotal: refundTotal.toFixed(2),
      currency: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY,
    };
  }
}
