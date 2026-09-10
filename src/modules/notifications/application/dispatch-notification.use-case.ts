import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationTier, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PROVIDER_REGISTRATION_CONSTANTS, REGION_CONSTANTS } from '../../../shared/config/constants';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isUserDisableable, isWithinQuietHours, respectsQuietHours, QuietHoursWindow } from '../domain/notification-tier-routing.rules';
import { NotificationChannel, NOTIFICATION_TEMPLATES } from '../domain/notification-templates';
import { DeliverNotificationUseCase } from './deliver-notification.use-case';
import { NotificationPreferenceRepository } from '../infrastructure/notification-preference.repository';
import { NotificationRepository } from '../infrastructure/notification.repository';

/**
 * File 12 Part 53 — `notifications`' outbox consumer. One call per drained
 * event: looks up the template for `eventName`, resolves the recipient,
 * creates one `Notification` row per allowed channel (never a row for a
 * channel the user has explicitly disabled — an opted-out channel is never
 * even recorded, matching the SRS's actual opt-out semantics), and hands
 * anything not currently quiet-hours-suppressed to `DeliverNotificationUseCase`.
 *
 * Row creation + preference/quiet-hours reads happen in one transaction;
 * the actual send happens strictly after it commits (never inside it — see
 * `DeliverNotificationUseCase`'s own doc comment for why).
 */
@Injectable()
export class DispatchNotificationUseCase {
  private readonly logger = new Logger(DispatchNotificationUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(NotificationPreferenceRepository) private readonly preferences: NotificationPreferenceRepository,
    @Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader,
    @Inject(DeliverNotificationUseCase) private readonly deliver: DeliverNotificationUseCase,
  ) {}

  async executeFromEvent(eventName: string, rawPayload: unknown): Promise<void> {
    const template = NOTIFICATION_TEMPLATES[eventName];
    if (!template) {
      // Registrar only ever registers handlers for keys in the same map,
      // so this branch is defensive, not a real path.
      return;
    }

    const payload = (rawPayload ?? {}) as Record<string, unknown>;
    const userId = template.extractUserId(payload);
    if (!userId) {
      this.logger.warn(`Event "${eventName}" payload has no recipient — nothing to notify.`);
      return;
    }

    const rendered = template.render(payload);

    const toDeliver = await this.prisma.$transaction(async (tx) => {
      const preferenceRows = await this.preferences.listForUser(tx, userId);
      const quietHours = await this.policyConfig.getValue<QuietHoursWindow>(
        tx,
        REGION_CONSTANTS.DEFAULT_REGION_CODE,
        'NOTIFICATION_QUIET_HOURS',
      );
      const nowLocalHour = DateTime.now().setZone(PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_IANA_TIMEZONE).hour;

      const created: { id: string; channel: NotificationChannel }[] = [];
      for (const channel of template.channels) {
        if (!this.isChannelAllowed(template.tier, channel, preferenceRows)) {
          continue;
        }

        const notification = await this.notifications.create(tx, {
          userId,
          tier: template.tier,
          channel,
          templateCode: eventName,
          title: rendered.title,
          body: rendered.body,
          data: rendered.data as Prisma.InputJsonValue | undefined,
        });

        const suppressedByQuietHours = respectsQuietHours(template.tier) && quietHours !== null && isWithinQuietHours(nowLocalHour, quietHours);
        if (!suppressedByQuietHours) {
          created.push({ id: notification.id, channel });
        }
      }
      return created;
    });

    for (const item of toDeliver) {
      await this.deliver.execute({
        id: item.id,
        userId,
        channel: item.channel,
        templateCode: eventName,
        title: rendered.title,
        body: rendered.body,
        data: rendered.data,
      });
    }
  }

  private isChannelAllowed(
    tier: NotificationTier,
    channel: NotificationChannel,
    preferenceRows: { tier: NotificationTier; channel: string; enabled: boolean }[],
  ): boolean {
    if (!isUserDisableable(tier)) {
      return true;
    }
    const preference = preferenceRows.find((row) => row.tier === tier && row.channel === channel);
    // No row means the user never touched this tier/channel — default is opted-in (File 10 §11: "users CAN opt out," implying on-by-default).
    return preference ? preference.enabled : true;
  }
}
