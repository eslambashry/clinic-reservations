import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { hashRefreshToken } from '../domain/refresh-token.util';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { TokenService } from '../infrastructure/token.service';

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenResult> {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const existing = await this.refreshTokens.findByTokenHash(this.prisma, tokenHash);

    if (!existing) {
      throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'جلستك غير معروفة أو منتهية. سجّل الدخول مرة أخرى.');
    }

    if (existing.revoked_at) {
      // Replay of an already-rotated token — theft signal (File 11 07.1/Part
      // 05.1). Revoking must commit even though we then throw, so it's a
      // direct write, not inside the transaction below.
      await this.refreshTokens.revokeAllActiveForUser(this.prisma, existing.user_id);
      this.logger.warn(`Refresh token reuse detected for user ${existing.user_id} — token family revoked.`);
      throw new UnauthenticatedError(
        'TOKEN_FAMILY_REVOKED',
        'تم إنهاء هذه الجلسة لأسباب أمنية. سجّل الدخول مرة أخرى.',
      );
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'انتهت صلاحية جلستك. سجّل الدخول مرة أخرى.');
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await this.refreshTokens.revoke(tx, existing.id);
      if (!revoked) {
        // Lost a concurrent-refresh race: another call revoked this exact
        // token first (between our read above and this conditional write).
        // Treat it the same as an unrecognized token, not as a theft
        // signal — this isn't a replay of an already-rotated token, it's
        // two legitimate calls racing on the same still-valid one.
        throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'تم استخدام هذه الجلسة من قبل. سجّل الدخول مرة أخرى.');
      }

      // Phase 1 scope: exactly one (PATIENT) membership per user — see the
      // same note in `verify-otp.use-case.ts`.
      const memberships = await this.roleMemberships.findActiveByUser(tx, existing.user_id);
      const activeMembership = memberships[0];
      if (!activeMembership) {
        throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'لا يوجد دور نشِط لهذا الحساب. تواصل مع الدعم.');
      }

      const issued = await this.tokens.rotate(tx, activeMembership, existing.id, existing.device_id ?? undefined);

      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      };
    });
  }
}
