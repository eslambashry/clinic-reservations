import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RetryFailedNotificationsUseCase } from '../application/retry-failed-notifications.use-case';

/**
 * File 12 Part 53, mirrors `HoldExpiryJob`/`SlotGenerationJob`'s pattern
 * exactly: a plain provider in the shared `AppModule` graph, inert in the
 * API process, only actually firing in the worker process (only
 * `WorkerModule` imports `ScheduleModule.forRoot()`).
 */
@Injectable()
export class NotificationRetryJob {
  private readonly logger = new Logger(NotificationRetryJob.name);

  constructor(@Inject(RetryFailedNotificationsUseCase) private readonly retryFailed: RetryFailedNotificationsUseCase) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    const result = await this.retryFailed.execute();
    if (result.retried > 0) {
      this.logger.log(`Notification retry sweep: ${result.retried} notification(s) retried`);
    }
  }
}
