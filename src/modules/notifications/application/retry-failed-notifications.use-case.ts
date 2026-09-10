import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DeliverNotificationUseCase } from './deliver-notification.use-case';
import { NotificationRepository } from '../infrastructure/notification.repository';

export interface RetryFailedNotificationsResult {
  retried: number;
}

/**
 * File 11 Part 19: "retried by a worker on FAILED up to N attempts, then
 * marked permanently FAILED." `NotificationRepository.findRetryable`
 * already excludes rows at/past `MAX_SEND_ATTEMPTS`, so once
 * `DeliverNotificationUseCase` marks a row `FAILED` for the Nth time it
 * simply stops being a candidate here — no separate "give up" step needed.
 */
@Injectable()
export class RetryFailedNotificationsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(DeliverNotificationUseCase) private readonly deliver: DeliverNotificationUseCase,
  ) {}

  async execute(): Promise<RetryFailedNotificationsResult> {
    const candidates = await this.notifications.findRetryable(
      this.prisma,
      NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS,
      NOTIFICATION_CONSTANTS.RETRY_SWEEP_BATCH_SIZE,
    );

    for (const notification of candidates) {
      await this.deliver.execute({
        id: notification.id,
        userId: notification.user_id,
        channel: notification.channel,
        templateCode: notification.template_code,
        title: notification.title,
        body: notification.body,
        data: notification.data as Record<string, unknown> | null,
      });
    }

    return { retried: candidates.length };
  }
}
