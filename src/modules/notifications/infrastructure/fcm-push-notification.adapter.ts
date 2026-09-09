import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { DomainError, ExternalProviderError } from '../../../shared/core/errors/domain-errors';
import { AppConfig } from '../../../shared/config/configuration';
import { PushNotificationMessage, PushNotificationPort, PushSendResult } from '../application/ports/push-notification.port';

/**
 * File 12 Part 53: real FCM implementation of `PushNotificationPort` —
 * `devices.fcm_token` already commits this codebase to Firebase (unlike
 * SMS, this isn't an open decision). Lazily initializes the Firebase Admin
 * SDK on first send rather than at module construction, so importing this
 * class never fails a boot that has no Firebase credentials yet — only an
 * actual send attempt does, with a clear `PUSH_PROVIDER_NOT_CONFIGURED`.
 */
@Injectable()
export class FcmPushNotificationAdapter implements PushNotificationPort {
  private readonly logger = new Logger(FcmPushNotificationAdapter.name);
  private readonly config: AppConfig['firebase'];
  private messaging: Messaging | null = null;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.config = configService.get<AppConfig['firebase']>('firebase') as AppConfig['firebase'];
  }

  async send(tokens: string[], message: PushNotificationMessage): Promise<PushSendResult> {
    if (tokens.length === 0) {
      return { invalidTokens: [] };
    }

    try {
      const response = await this.getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data ? this.stringifyData(message.data) : undefined,
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          invalidTokens.push(tokens[index]);
        }
      });
      return { invalidTokens };
    } catch (error) {
      this.logger.error({ err: error }, 'FCM send failed');
      throw new ExternalProviderError('Firebase', 502, error);
    }
  }

  /** FCM's `data` payload requires every value to be a string. */
  private stringifyData(data: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
  }

  private getMessaging(): Messaging {
    if (this.messaging) {
      return this.messaging;
    }
    if (!this.config.projectId || !this.config.clientEmail || !this.config.privateKey) {
      throw new DomainError(500, 'PUSH_PROVIDER_NOT_CONFIGURED', 'خدمة الإشعارات غير مُهيّأة حاليًا.', {
        missingEnvVars: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'].filter(
          (name) => !process.env[name],
        ),
      });
    }

    const app: App =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: this.config.projectId,
          clientEmail: this.config.clientEmail,
          privateKey: this.config.privateKey,
        }),
      });
    this.messaging = getMessaging(app);
    return this.messaging;
  }
}
