import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpireWaitingVisitsUseCase } from '../application/expire-waiting-visits.use-case';

/** Worker-only periodic sweep. Five minutes bounds how long an expired visit
 * can remain in the active waiting queue without scanning appointments in
 * application memory. */
@Injectable()
export class WaitingVisitExpiryJob {
  private readonly logger = new Logger(WaitingVisitExpiryJob.name);

  constructor(@Inject(ExpireWaitingVisitsUseCase) private readonly expireWaitingVisits: ExpireWaitingVisitsUseCase) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    const updated = await this.expireWaitingVisits.execute();
    if (updated > 0) this.logger.log(`Visit expiry sweep: ${updated} appointment(s) marked TIME_EXPIRED`);
  }
}
