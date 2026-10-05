import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DeviceRepository } from '../infrastructure/device.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';

export interface RegisterDeviceInput {
  userId: string;
  /** The access token's `sid` claim; absent only on tokens minted before 2026-09-26. */
  sessionId?: string;
  fcmToken: string;
  platform: string;
  appVersion?: string;
}

export interface RegisterDeviceResult {
  deviceId: string;
}

/**
 * File 12 Part 53 `POST /v1/auth/devices` — the piece Push notifications
 * were structurally missing: `devices.fcm_token` existed in the schema but
 * no endpoint ever wrote to it, so `NotificationsModule`'s FCM adapter
 * would have had zero recipients regardless of how correct it was.
 *
 * A token has exactly one owner (unique `fcm_token`). Re-registering it
 * moves ownership to the authenticated user, including in a shared browser
 * after an account switch.
 *
 * Ownership is bound to the caller's login session (2026-09-26). The access
 * token stays valid for its TTL after logout, so without this a
 * registration request that was still in flight when the user logged out
 * would recreate the row for the logged-out account — and could even move
 * the token back from the account that signed in next. The session's live
 * refresh-token row is share-locked in the same transaction as the upsert;
 * logout's revoke UPDATE on that row serializes against it (see
 * `LogoutUseCase`), so either logout runs second and removes this row, or
 * it ran first and this request is rejected here.
 */
@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    const { sessionId } = input;
    if (!sessionId) {
      // A 401 makes both clients refresh once (their refresh token is still
      // live) and retry with a token that carries `sid`.
      throw new UnauthenticatedError('SESSION_REFRESH_REQUIRED', 'يلزم تحديث الجلسة قبل تفعيل الإشعارات.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.refreshTokens.lockUserForAuthMutation(tx, input.userId);
      const live = await this.refreshTokens.lockLiveSession(tx, input.userId, sessionId);
      if (!live) {
        // Deliberately not 401: both clients refresh-and-retry on 401, and
        // refreshing with the just-revoked token would trip the refresh
        // theft signal and revoke every other session of this user.
        throw new ConflictError('DEVICE_SESSION_ENDED', 'انتهت الجلسة التي طلبت تفعيل الإشعارات على هذا الجهاز.');
      }
      const device = await this.devices.upsertByToken(tx, { ...input, sessionId });
      await this.devices.detachRefreshTokensOnTransfer(tx, device.id, input.userId, sessionId);
      return { deviceId: device.id };
    });
  }
}
