import { Injectable } from '@nestjs/common';
import { Prisma, RefreshToken } from '@prisma/client';

@Injectable()
export class RefreshTokenRepository {
  /** Serialize all token/device mutations for one identity, including new sibling refresh tokens. */
  async lockUserForAuthMutation(db: Prisma.TransactionClient, userId: string): Promise<void> {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`);
  }
  create(
    db: Prisma.TransactionClient,
    params: { userId: string; tokenHash: string; sessionId: string; expiresAt: Date; deviceId?: string; rotatedFromTokenId?: string },
  ): Promise<RefreshToken> {
    return db.refreshToken.create({
      data: {
        user_id: params.userId,
        token_hash: params.tokenHash,
        session_id: params.sessionId,
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
   * Share-locks one live refresh token of the session for the rest of the
   * caller's transaction. A concurrent logout's `revokeSession` UPDATE on
   * the same row therefore waits for the caller to commit (and then sees
   * and removes whatever the caller wrote), while a caller that runs after
   * logout committed finds no live row. `false` means the session ended.
   */
  async lockLiveSession(db: Prisma.TransactionClient, userId: string, sessionId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "refresh_tokens"
      WHERE "session_id" = ${sessionId}::uuid
        AND "user_id" = ${userId}::uuid
        AND "revoked_at" IS NULL
        AND "expires_at" > NOW()
      LIMIT 1
      FOR SHARE
    `);
    return rows.length === 1;
  }

  /** Logout of one login session: revokes every still-active token in the family (a context switch can leave more than one). */
  async revokeSession(db: Prisma.TransactionClient, userId: string, sessionId: string): Promise<number> {
    const result = await db.refreshToken.updateMany({
      where: { user_id: userId, session_id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count;
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
