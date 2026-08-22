import { Injectable } from '@nestjs/common';
import { Prisma, RefreshToken } from '@prisma/client';

@Injectable()
export class RefreshTokenRepository {
  create(
    db: Prisma.TransactionClient,
    params: { userId: string; tokenHash: string; expiresAt: Date; deviceId?: string; rotatedFromTokenId?: string },
  ): Promise<RefreshToken> {
    return db.refreshToken.create({
      data: {
        user_id: params.userId,
        token_hash: params.tokenHash,
        expires_at: params.expiresAt,
        device_id: params.deviceId,
        rotated_from_token_id: params.rotatedFromTokenId,
      },
    });
  }

  findByTokenHash(db: Prisma.TransactionClient, tokenHash: string): Promise<RefreshToken | null> {
    return db.refreshToken.findUnique({ where: { token_hash: tokenHash } });
  }

  /**
   * Conditional revoke, not a plain `update` — `false` means another
   * concurrent call already revoked this exact token first (a genuine race
   * on `/token/refresh`, not a bug: two callers can both read the token as
   * not-yet-revoked before either commits). The caller must not proceed to
   * mint a new token pair from a predecessor it didn't actually get to
   * revoke itself. Same conditional-updateMany shape as every other
   * concurrency-guarded write in the codebase (e.g.
   * `AppointmentHoldRepository.markConverted`).
   */
  async revoke(db: Prisma.TransactionClient, id: string): Promise<boolean> {
    const result = await db.refreshToken.updateMany({ where: { id, revoked_at: null }, data: { revoked_at: new Date() } });
    return result.count === 1;
  }

  /**
   * Theft-signal response (File 11 07.1/Part 05.1: "the entire token family
   * is revoked"). Revokes every currently-active token for the user, not
   * just the one presented — simpler and safer than reconstructing a
   * per-device family by walking `rotated_from_token_id` chains, and a
   * theft signal on any one device warrants forcing full re-auth everywhere
   * (File 12 Part 07/12: documented, deliberate interpretation).
   */
  async revokeAllActiveForUser(db: Prisma.TransactionClient, userId: string): Promise<number> {
    const result = await db.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count;
  }
}
