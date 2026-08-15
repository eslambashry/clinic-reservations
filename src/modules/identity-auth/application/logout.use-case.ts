import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { hashRefreshToken } from '../domain/refresh-token.util';
import { RefreshTokenRepository } from '../infrastructure/refresh-token.repository';

export interface LogoutInput {
  refreshToken: string;
  allDevices?: boolean;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const existing = await this.refreshTokens.findByTokenHash(this.prisma, tokenHash);

    // An unrecognized/already-revoked token is treated as "already logged
    // out" — a no-op success, not an error. Logout must never become a way
    // to probe whether a token value is valid.
    if (!existing) {
      return;
    }

    if (input.allDevices) {
      await this.refreshTokens.revokeAllActiveForUser(this.prisma, existing.user_id);
      return;
    }

    if (!existing.revoked_at) {
      await this.refreshTokens.revoke(this.prisma, existing.id);
    }
  }
}
