import { Module } from '@nestjs/common';
import { NotificationsController } from './api/notifications.controller';
import { DeliverNotificationUseCase } from './application/deliver-notification.use-case';
import { DispatchNotificationUseCase } from './application/dispatch-notification.use-case';
import { GetNotificationPreferencesUseCase } from './application/get-notification-preferences.use-case';
import { ListNotificationsUseCase } from './application/list-notifications.use-case';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { PUSH_NOTIFICATION_SENDER } from './application/ports/push-notification.port';
import { SMS_SENDER } from './application/ports/sms-sender.port';
import { RetryFailedNotificationsUseCase } from './application/retry-failed-notifications.use-case';
import { UpdateNotificationPreferencesUseCase } from './application/update-notification-preferences.use-case';
import { FcmPushNotificationAdapter } from './infrastructure/fcm-push-notification.adapter';
import { LoggingSmsSender } from './infrastructure/logging-sms-sender';
import { NotificationOutboxRegistrar } from './infrastructure/notification-outbox.registrar';
import { NotificationPreferenceRepository } from './infrastructure/notification-preference.repository';
import { NotificationRepository } from './infrastructure/notification.repository';
import { NotificationRetryJob } from './infrastructure/notification-retry.job';
import { IdentityAuthModule } from '../identity-auth/identity-auth.module';

/**
 * File 11 Part 03/19 (Phase 8 — File 12 Part 10): owns `notifications`,
 * `notification_preferences` — no other module reaches into these tables
 * directly (File 12 Part 05). Imports `IdentityAuthModule` for the two
 * reads it needs (`ListUserDeviceTokensUseCase`, `GetUserContactInfoUseCase`)
 * — never Identity's `infrastructure/`.
 *
 * `NotificationOutboxRegistrar` and `NotificationRetryJob` are plain
 * providers here (not conditionally registered) — both already no-op
 * correctly in the API process on their own (`OutboxWorker` resolves
 * `undefined` there; `@Cron` simply never ticks there), so there's no need
 * to duplicate `HoldExpiryJob`'s "declared once, fires once" pattern with
 * extra conditional wiring.
 */
@Module({
  imports: [IdentityAuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    NotificationPreferenceRepository,
    NotificationOutboxRegistrar,
    NotificationRetryJob,
    DispatchNotificationUseCase,
    DeliverNotificationUseCase,
    RetryFailedNotificationsUseCase,
    ListNotificationsUseCase,
    MarkNotificationReadUseCase,
    GetNotificationPreferencesUseCase,
    UpdateNotificationPreferencesUseCase,
    { provide: PUSH_NOTIFICATION_SENDER, useClass: FcmPushNotificationAdapter },
    { provide: SMS_SENDER, useClass: LoggingSmsSender },
  ],
})
export class NotificationsModule {}
