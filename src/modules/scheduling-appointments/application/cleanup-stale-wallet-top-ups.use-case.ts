import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ExpireStaleWalletTopUpUseCase } from '../../payments/application/expire-stale-wallet-top-up.use-case';
import { FindStalePendingOnlinePaymentsUseCase } from '../../payments/application/find-stale-pending-online-payments.use-case';
import { ReconcilePaymobPaymentsUseCase } from './reconcile-paymob-payments.use-case';

const BATCH_SIZE = 100;

/**
 * Abandoned top-ups: PENDING `WALLET_TOPUP` intents older than `STALE_TOPUP_HOURS`. Each is reconciled
 * with Paymob first; if Paymob reports it PAID the normal path credits it (it is then no longer
 * `CREATED`, so expiry is a no-op). Otherwise (failed / not found / still pending at gateway) it is
 * expired (intent CANCELLED, wallet transaction FAILED), which also frees the daily top-up limit.
 * If the gateway cannot be queried (error), the row is left for the next run - never expired blind.
 */
@Injectable()
export class CleanupStaleWalletTopUpsUseCase {
  private readonly logger = new Logger(CleanupStaleWalletTopUpsUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FindStalePendingOnlinePaymentsUseCase) private readonly findStale: FindStalePendingOnlinePaymentsUseCase,
    @Inject(ReconcilePaymobPaymentsUseCase) private readonly reconcile: ReconcilePaymobPaymentsUseCase,
    @Inject(ExpireStaleWalletTopUpUseCase) private readonly expire: ExpireStaleWalletTopUpUseCase,
  ) {}

  async execute(now: Date = new Date()): Promise<{ checked: number; expired: number }> {
    const items = await this.findStale.execute({
      payableTypes: ['WALLET_TOPUP'],
      olderThan: new Date(now.getTime() - PAYMENT_CONSTANTS.STALE_TOPUP_HOURS * 60 * 60 * 1000),
      requireInitiatedAttempt: false,
      limit: BATCH_SIZE,
    });
    let expired = 0;
    for (const item of items) {
      const outcome = await this.reconcile.reconcileOne(item);
      if (outcome === 'ERROR') {
        continue;
      }
      try {
        if (await this.prisma.$transaction((tx) => this.expire.execute(tx, item.paymentIntentId))) {
          expired += 1;
        }
      } catch (error) {
        this.logger.warn({ err: error, paymentIntentId: item.paymentIntentId }, 'Failed to expire a stale top-up; will retry next run');
      }
    }
    return { checked: items.length, expired };
  }
}
