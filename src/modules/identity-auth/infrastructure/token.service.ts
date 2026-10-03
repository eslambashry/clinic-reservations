import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleMembership } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { generateRefreshToken, hashRefreshToken } from '../domain/refresh-token.util';
import { PermissionRepository } from './permission.repository';
import { RefreshTokenRepository } from './refresh-token.repository';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Owns access/refresh token issuance and rotation (File 11 07.1) — this is
 * Identity's own business logic (which claims go in the token, how
 * rotation links to its predecessor), not a `shared/core` concern.
 * `shared/core/auth` only owns verifying a token that already exists.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RefreshTokenRepository) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PermissionRepository) private readonly permissions: PermissionRepository,
  ) {}

  /**
   * First issuance for a session (OTP/password login) — no predecessor to
   * link. `sessionId` is passed only by context switch, which keeps the
   * caller's login session so logout still ends every token it holds.
   */
  issue(db: Prisma.TransactionClient, membership: RoleMembership, deviceId?: string, sessionId?: string): Promise<IssuedTokens> {
    return this.issueInternal(db, membership, sessionId ?? randomUUID(), deviceId);
  }

  /** Rotation (`/token/refresh`) — chains the new refresh token to the one it replaces (Part 09: `rotated_from_token_id`) inside the same session. */
  rotate(
    db: Prisma.TransactionClient,
    membership: RoleMembership,
    previousTokenId: string,
    sessionId: string,
    deviceId?: string,
  ): Promise<IssuedTokens> {
    return this.issueInternal(db, membership, sessionId, deviceId, previousTokenId);
  }

  private async issueInternal(
    db: Prisma.TransactionClient,
    membership: RoleMembership,
    sessionId: string,
    deviceId?: string,
    rotatedFromTokenId?: string,
  ): Promise<IssuedTokens> {
    const permissionCodes = await this.permissions.findCodesByRole(db, membership.role_code);

    const payload: AccessTokenPayload = {
      sub: membership.user_id,
      roleMembershipId: membership.id,
      roleCode: membership.role_code,
      contextType: membership.context_type,
      permissions: permissionCodes,
      sid: sessionId,
    };

    const accessTtlSeconds = this.config.get<number>('jwt.accessTtlSeconds') as number;
    const refreshTtlSeconds = this.config.get<number>('jwt.refreshTtlSeconds') as number;

    const accessToken = await this.jwt.signAsync(payload);

    const rawRefreshToken = generateRefreshToken();
    await this.refreshTokens.create(db, {
      userId: membership.user_id,
      tokenHash: hashRefreshToken(rawRefreshToken),
      sessionId,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      deviceId,
      rotatedFromTokenId,
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: accessTtlSeconds };
  }
}
