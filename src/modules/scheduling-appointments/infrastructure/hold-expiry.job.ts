import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpireHoldsUseCase } from '../application/expire-holds.use-case';

/**
 * File 12 Part 35.9: a thin `@Cron()` wrapper around `ExpireHoldsUseCase`,
 * placed and registered exactly like `SlotGenerationJob` (Part 33.10) — a
 * normal provider in `SchedulingAppointmentsModule`, inert in the API
 * process, only actually firing in the worker process (only `WorkerModule`
 * imports `ScheduleModule.forRoot()`). Runs every minute — the 5-minute
 * hold TTL needs sub-5-minute sweep granularity to bound how long a slot
 * can appear falsely `HELD` after its hold expires.
 */
@Injectable()
export class HoldExpiryJob {
  private readonly logger = new Logger(HoldExpiryJob.name);

  constructor(@Inject(ExpireHoldsUseCase) private readonly expireHolds: ExpireHoldsUseCase) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    const result = await this.expireHolds.execute();
    if (result.expired > 0) {
      this.logger.log(`Hold expiry sweep: ${result.expired} hold(s) expired`);
    }
  }
}
