import { Injectable } from '@nestjs/common';
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
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly permissions: PermissionRepository,
  ) {}

  /** First issuance for a session (OTP verify) — no predecessor to link. */
  issue(db: Prisma.TransactionClient, membership: RoleMembership, deviceId?: string): Promise<IssuedTokens> {
    return this.issueInternal(db, membership, deviceId);
  }

  /** Rotation (`/token/refresh`) — chains the new refresh token to the one it replaces (Part 09: `rotated_from_token_id`). */
  rotate(
    db: Prisma.TransactionClient,
    membership: RoleMembership,
    previousTokenId: string,
    deviceId?: string,
  ): Promise<IssuedTokens> {
    return this.issueInternal(db, membership, deviceId, previousTokenId);
  }

  private async issueInternal(
    db: Prisma.TransactionClient,
    membership: RoleMembership,
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
    };

    const accessTtlSeconds = this.config.get<number>('jwt.accessTtlSeconds') as number;
    const refreshTtlSeconds = this.config.get<number>('jwt.refreshTtlSeconds') as number;

    const accessToken = await this.jwt.signAsync(payload);

    const rawRefreshToken = generateRefreshToken();
    await this.refreshTokens.create(db, {
      userId: membership.user_id,
      tokenHash: hashRefreshToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      deviceId,
      rotatedFromTokenId,
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: accessTtlSeconds };
  }
}
