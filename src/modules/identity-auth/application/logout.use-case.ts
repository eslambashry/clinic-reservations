import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { hashRefreshToken } from '../domain/refresh-token.util';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';
import { DeviceRepository } from '../infrastructure/device.repository';

export interface LogoutInput {
  refreshToken: string;
  allDevices?: boolean;
  fcmToken?: string;
}

/**
 * Ends one login session (or, with `allDevices`, every session of the user)
 * and releases the FCM ownership that session held — in one transaction.
 *
 * Ordering matters for the registration race (see `RegisterDeviceUseCase`):
 * the session revoke UPDATE runs first, so it waits for any in-flight
 * registration that share-locked the same refresh-token row, and the device
 * delete that follows then sees and removes the row that registration wrote.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const tokenHash = hashRefreshToken(input.refreshToken);

    await this.prisma.$transaction(async (tx) => {
      const existing = await this.refreshTokens.findByTokenHash(tx, tokenHash);

      // An unrecognized token is treated as "already logged out" — a no-op
      // success, not an error. Every path returns 204, so logout never
      // becomes a way to probe whether a token value is valid.
      if (!existing) {
        return;
      }
      await this.refreshTokens.lockUserForAuthMutation(tx, existing.user_id);

      // Logging out everywhere is only honored for a still-active token; a
      // rotated-out token can at most end its own session below.
      if (input.allDevices && !existing.revoked_at) {
        await this.refreshTokens.revokeAllActiveForUser(tx, existing.user_id);
        await this.devices.deleteAllForUser(tx, existing.user_id);
        return;
      }

      // Revokes every live token of this session, including a successor
      // minted by rotation or a context switch, so a client holding a stale
      // rotated token still ends the session it belongs to.
      await this.refreshTokens.revokeSession(tx, existing.user_id, existing.session_id);
      await this.devices.deleteForSession(tx, existing.user_id, existing.session_id, input.fcmToken);
    });
  }
}
