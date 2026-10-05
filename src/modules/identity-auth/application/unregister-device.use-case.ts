import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { DeviceRepository } from '../infrastructure/device.repository';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';

/** Idempotent, bearer-authenticated token removal scoped to its current owner. */
@Injectable()
export class UnregisterDeviceUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DeviceRepository) private readonly devices: DeviceRepository,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(userId: string, sessionId: string | undefined, fcmToken: string): Promise<void> {
    if (!sessionId) {
      throw new UnauthenticatedError('SESSION_REFRESH_REQUIRED', 'يلزم تحديث الجلسة قبل إلغاء تسجيل الجهاز.');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.refreshTokens.lockUserForAuthMutation(tx, userId);
      // Even if an old access JWT is still within its TTL, an ended session
      // cannot mutate device ownership. The token predicate remains scoped
      // to this session so an older logout/unregister cannot delete a token
      // that was transferred to a newer session of the same account.
      if (!(await this.refreshTokens.lockLiveSession(tx, userId, sessionId))) return;
      await this.devices.deleteOwnedToken(tx, userId, sessionId, fcmToken);
    });
  }
}
