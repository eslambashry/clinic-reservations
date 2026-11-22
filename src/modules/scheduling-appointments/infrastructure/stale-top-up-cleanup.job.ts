import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CleanupStaleWalletTopUpsUseCase } from '../application/cleanup-stale-wallet-top-ups.use-case';

/** Hourly: expire abandoned PENDING wallet top-ups (after a final Paymob reconciliation). */
@Injectable()
export class StaleTopUpCleanupJob {
  private readonly logger = new Logger(StaleTopUpCleanupJob.name);

  constructor(@Inject(CleanupStaleWalletTopUpsUseCase) private readonly cleanup: CleanupStaleWalletTopUpsUseCase) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const result = await this.cleanup.execute();
    if (result.expired > 0) {
      this.logger.log(`Stale top-up cleanup: ${result.expired} of ${result.checked} expired`);
    }
  }
}
