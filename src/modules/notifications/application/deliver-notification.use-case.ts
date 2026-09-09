import { Inject, Injectable, Logger } from '@nestjs/common';
import { GetUserContactInfoUseCase } from '../../identity-auth/application/get-user-contact-info.use-case';
import { ListUserDeviceTokensUseCase } from '../../identity-auth/application/list-user-device-tokens.use-case';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PUSH_NOTIFICATION_SENDER, PushNotificationPort } from './ports/push-notification.port';
import { SMS_SENDER, SmsSenderPort } from './ports/sms-sender.port';
import { NotificationRepository } from '../infrastructure/notification.repository';

export interface DeliverableNotification {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}

/**
 * File 12 Part 53: the actual send, factored out of `DispatchNotificationUseCase`
 * so `NotificationRetryJob` can reuse it byte-for-byte instead of
 * duplicating the push/SMS branching. Deliberately never opens its own
 * `$transaction` — `markSent`/`markFailed` are single-row writes with no
 * atomicity requirement against anything else, and the actual send is a
 * slow external call that must never hold a DB transaction open (same
 * "upload before opening the transaction" reasoning `RecordResultUseCase`
 * already established for ImageKit).
 *
 * Never throws — a failed send is recorded (`markFailed`, incrementing
 * `attempts`) and swallowed, not re-thrown, so the caller (the outbox
 * handler) always reaches `PROCESSED`. File 11 Part 19's own retry
 * mechanism for notification sends is `NotificationRetryJob`'s sweep over
 * `FAILED` rows, a separate loop from the outbox's event-delivery retry.
 */
@Injectable()
export class DeliverNotificationUseCase {
  private readonly logger = new Logger(DeliverNotificationUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(PUSH_NOTIFICATION_SENDER) private readonly push: PushNotificationPort,
    @Inject(SMS_SENDER) private readonly sms: SmsSenderPort,
    @Inject(ListUserDeviceTokensUseCase) private readonly listUserDeviceTokens: ListUserDeviceTokensUseCase,
    @Inject(GetUserContactInfoUseCase) private readonly getUserContactInfo: GetUserContactInfoUseCase,
  ) {}

  async execute(notification: DeliverableNotification): Promise<void> {
    try {
      if (notification.channel === 'PUSH') {
        const tokens = await this.listUserDeviceTokens.execute(notification.userId);
        if (tokens.length === 0) {
          throw new Error('No registered device tokens for this user');
        }
        await this.push.send(tokens, { title: notification.title, body: notification.body, data: notification.data ?? undefined });
      } else if (notification.channel === 'SMS') {
        const contact = await this.getUserContactInfo.execute(notification.userId);
        if (!contact) {
          throw new Error('No phone on file for this user');
        }
        await this.sms.send(contact.phone, `${notification.title} - ${notification.body}`);
      } else {
        throw new Error(`Unsupported notification channel "${notification.channel}"`);
      }

      await this.notifications.markSent(this.prisma, notification.id);
    } catch (error) {
      await this.notifications.markFailed(this.prisma, notification.id);
      this.logger.warn(
        `Notification ${notification.id} (${notification.channel}) delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
