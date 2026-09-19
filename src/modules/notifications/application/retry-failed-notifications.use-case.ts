import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { NOTIFICATION_CONSTANTS, PROVIDER_REGISTRATION_CONSTANTS, REGION_CONSTANTS } from '../../../shared/config/constants';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isWithinQuietHours, respectsQuietHours, QuietHoursWindow } from '../domain/notification-tier-routing.rules';
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
 *
 * This sweep is also what eventually delivers quiet-hours-suppressed rows.
 * `DispatchNotificationUseCase` runs exactly once per event, so a row it
 * left `PENDING` because quiet hours were in force has no other path to
 * the sender — hence `findRetryable` returns `PENDING` rows too, and the
 * quiet-hours check is re-evaluated here so they go out once the window
 * has actually passed rather than immediately.
 */
@Injectable()
export class RetryFailedNotificationsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(DeliverNotificationUseCase) private readonly deliver: DeliverNotificationUseCase,
  ) {}

  async execute(): Promise<RetryFailedNotificationsResult> {
    const candidates = await this.notifications.findRetryable(
      this.prisma,
      NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS,
      NOTIFICATION_CONSTANTS.RETRY_SWEEP_BATCH_SIZE,
    );

    const quietHours = await this.policyConfig.getValue<QuietHoursWindow>(
      this.prisma,
      REGION_CONSTANTS.DEFAULT_REGION_CODE,
      'NOTIFICATION_QUIET_HOURS',
    );
    const nowLocalHour = DateTime.now().setZone(PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_IANA_TIMEZONE).hour;
    const inQuietHours = quietHours !== null && isWithinQuietHours(nowLocalHour, quietHours);

    let retried = 0;
    for (const notification of candidates) {
      // Still inside the quiet-hours window — leave it for a later sweep
      // rather than defeating the suppression dispatch just applied.
      if (inQuietHours && respectsQuietHours(notification.tier)) {
        continue;
      }

      await this.deliver.execute({
        id: notification.id,
        userId: notification.user_id,
        channel: notification.channel,
        templateCode: notification.template_code,
        title: notification.title,
        body: notification.body,
        data: notification.data as Record<string, unknown> | null,
      });
      retried += 1;
    }

    return { retried };
  }
}
