import { Injectable, Logger } from '@nestjs/common';
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
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly roleMemberships: RoleMembershipRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenResult> {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const existing = await this.refreshTokens.findByTokenHash(this.prisma, tokenHash);

    if (!existing) {
      throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'This refresh token is not recognized.');
    }

    if (existing.revoked_at) {
      // Replay of an already-rotated token — theft signal (File 11 07.1/Part
      // 05.1). Revoking must commit even though we then throw, so it's a
      // direct write, not inside the transaction below.
      await this.refreshTokens.revokeAllActiveForUser(this.prisma, existing.user_id);
      this.logger.warn(`Refresh token reuse detected for user ${existing.user_id} — token family revoked.`);
      throw new UnauthenticatedError(
        'TOKEN_FAMILY_REVOKED',
        'This session was revoked for security reasons — please sign in again.',
      );
    }

    if (existing.expires_at.getTime() < Date.now()) {
      throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'This refresh token has expired.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.refreshTokens.revoke(tx, existing.id);

      // Phase 1 scope: exactly one (PATIENT) membership per user — see the
      // same note in `verify-otp.use-case.ts`.
      const memberships = await this.roleMemberships.findActiveByUser(tx, existing.user_id);
      const activeMembership = memberships[0];
      if (!activeMembership) {
        throw new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'No active role membership for this account.');
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
