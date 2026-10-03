import { Inject, Injectable, Logger } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { GetUserContactInfoUseCase } from '../../identity-auth/application/get-user-contact-info.use-case';
import { ListUserDeviceTokensUseCase } from '../../identity-auth/application/list-user-device-tokens.use-case';
import { PruneDeviceTokensUseCase } from '../../identity-auth/application/prune-device-tokens.use-case';
import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { NOTIFICATION_TEMPLATES } from '../domain/notification-templates';
import { PUSH_NOTIFICATION_SENDER, PushNotificationPort } from './ports/push-notification.port';
import { SMS_SENDER, SmsChannelUnavailableError, SmsSenderPort } from './ports/sms-sender.port';
import { NotificationRepository } from '../infrastructure/notification.repository';

export interface DeliverableNotification {
  id: string;
  userId: string;
  channel: string;
  templateCode: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}

/**
 * Only opaque identifiers and routing hints travel in the FCM data payload
 * (which the OS and FCM can log); names, phones and clinical text stay in the
 * authenticated inbox row.
 */
const PUSH_DATA_KEYS = new Set([
  'notificationId', 'appointmentId', 'pharmacyOrderId', 'labOrderId', 'prescriptionId',
  'paymentIntentId', 'walletId', 'doctorId', 'clinicId',
]);

/**
 * File 12 Part 53: the actual send, factored out of `DispatchNotificationUseCase`
 * so `NotificationRetryJob` can reuse it byte-for-byte instead of
 * duplicating the push/SMS branching. Deliberately never opens its own
 * `$transaction` — the actual send is a slow external call that must never
 * hold a DB transaction open (same "upload before opening the transaction"
 * reasoning `RecordResultUseCase` already established for ImageKit).
 *
 * Delivery semantics (2026-09-26 hardening):
 *  - Claim first. `claimForDelivery` atomically moves the row to PROCESSING
 *    under a lease, so dispatch and the retry sweep can never both send it;
 *    a crashed worker's lease expires and the row becomes retryable.
 *  - Outcome writes are fenced by that lease (see the repository).
 *  - PUSH is accounted per device: FCM-accepted targets count toward
 *    `accepted_device_count`, permanently invalid tokens are pruned, and only
 *    transiently failed targets are kept in `retry_tokens`. A retry re-sends
 *    only to those targets that still belong to this user — a token that
 *    moved to another account is never retried from this row.
 *  - "Accepted by FCM" is not "displayed on the device"; SENT means handed
 *    off to at least one of the user's devices.
 *  - An unconfigured SMS provider closes the row as FAILED immediately.
 *
 * Never throws — a failed send is recorded and swallowed, so the caller (the
 * outbox handler) always reaches `PROCESSED`. File 11 Part 19's own retry
 * mechanism for notification sends is `NotificationRetryJob`'s sweep, a
 * separate loop from the outbox's event-delivery retry.
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
    @Inject(PruneDeviceTokensUseCase) private readonly pruneDeviceTokens: PruneDeviceTokensUseCase,
    @Inject(GetUserContactInfoUseCase) private readonly getUserContactInfo: GetUserContactInfoUseCase,
  ) {}

  async execute(notification: DeliverableNotification): Promise<void> {
    const claimed = await this.notifications.claimForDelivery(this.prisma, notification.id, NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS);
    if (!claimed?.lease_until) {
      // Already sent, out of attempts, or another worker holds a live lease.
      return;
    }
    const lease = claimed.lease_until;

    const attemptedTokens: string[] = [];
    try {
      if (notification.channel === 'PUSH') {
        await this.deliverPush(notification, claimed, lease, attemptedTokens);
        return;
      }
      if (notification.channel === 'SMS') {
        await this.deliverSms(notification, lease);
        return;
      }
      throw new Error(`Unsupported notification channel "${notification.channel}"`);
    } catch (error) {
      await this.notifications.markFailed(this.prisma, notification.id, lease, attemptedTokens);
      this.logger.warn(
        `Notification ${notification.id} (${notification.channel}) delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Records targets before calling FCM so a provider exception retains their retry set. */
  private async deliverPush(notification: DeliverableNotification, claimed: Notification, lease: Date, attemptedTokens: string[]): Promise<void> {
    const currentDevices = await this.listUserDeviceTokens.execute(notification.userId);
    const currentTokens = currentDevices.map(({ fcmToken }) => fcmToken);
    const tokens = claimed.retry_tokens.length > 0
      ? claimed.retry_tokens.filter((token) => currentTokens.includes(token))
      : currentTokens;

    if (tokens.length === 0) {
      if (claimed.accepted_device_count > 0) {
        // Earlier attempts already reached a device; the retryable targets
        // are gone (logged out / moved account), so there is nothing left.
        await this.notifications.markSent(this.prisma, notification.id, lease);
        return;
      }
      throw new Error('No registered device tokens for this user');
    }

    attemptedTokens.push(...tokens);
    // The user explicitly opted in to seeing the actual notification outside
    // the app. Routing data remains opaque, while title/body match the inbox.
    const result = await this.push.send(tokens, {
      title: notification.title,
      body: notification.body,
      data: this.pushData(notification),
    });

    // Best-effort: a failed cleanup must never turn a delivered notification
    // into a FAILED row, so it is caught here rather than in `execute`.
    if (result.invalidTokens.length > 0) {
      try {
        const invalidRegistrations = currentDevices.filter(({ fcmToken }) => result.invalidTokens.includes(fcmToken));
        const pruned = await this.pruneDeviceTokens.execute(notification.userId, invalidRegistrations);
        this.logger.log(`Pruned ${pruned} dead device token(s) after notification ${notification.id}`);
      } catch (pruneError) {
        this.logger.warn(`Failed to prune dead device tokens: ${pruneError instanceof Error ? pruneError.message : String(pruneError)}`);
      }
    }

    if (result.retryableTokens.length > 0) {
      await this.notifications.markFailed(this.prisma, notification.id, lease, result.retryableTokens, result.acceptedTokens.length);
      return;
    }
    if (result.acceptedTokens.length + claimed.accepted_device_count === 0) {
      // Every target was permanently invalid — nothing reached the user.
      // Every token was permanently invalid. A retry cannot succeed until
      // the client registers a fresh token for a future notification.
      await this.notifications.markUndeliverable(this.prisma, notification.id, lease, NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS);
      return;
    }
    await this.notifications.markSent(this.prisma, notification.id, lease, result.acceptedTokens.length);
  }

  private async deliverSms(notification: DeliverableNotification, lease: Date): Promise<void> {
    const contact = await this.getUserContactInfo.execute(notification.userId);
    if (!contact) {
      throw new Error('No phone on file for this user');
    }
    try {
      await this.sms.send(contact.phone, `${notification.title} - ${notification.body}`);
    } catch (error) {
      if (error instanceof SmsChannelUnavailableError) {
        await this.notifications.markUndeliverable(this.prisma, notification.id, lease, NOTIFICATION_CONSTANTS.MAX_SEND_ATTEMPTS);
        this.logger.warn(`Notification ${notification.id} (SMS) not delivered: no SMS provider is configured (DEC-003 open).`);
        return;
      }
      throw error;
    }
    await this.notifications.markSent(this.prisma, notification.id, lease);
  }

  private pushData(notification: DeliverableNotification): Record<string, unknown> {
    const data = Object.fromEntries(
      Object.entries(notification.data ?? {}).filter(([key, value]) => PUSH_DATA_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')),
    );
    const tier = NOTIFICATION_TEMPLATES[notification.templateCode]?.tier;
    return {
      ...data,
      notificationId: notification.id,
      templateCode: notification.templateCode,
      ...(tier ? { tier } : {}),
    };
  }
}
