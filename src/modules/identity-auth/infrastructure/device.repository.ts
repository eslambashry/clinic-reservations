import { Injectable } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';

export interface RegisterDeviceInput {
  userId: string;
  sessionId: string;
  fcmToken: string;
  platform: string;
  appVersion?: string;
}

export interface DeviceTokenRegistration {
  id: string;
  fcmToken: string;
  sessionId: string | null;
  version: number;
}

@Injectable()
export class DeviceRepository {
  /**
   * `devices.fcm_token` is unique, so this is a native
   * `INSERT ... ON CONFLICT (fcm_token) DO UPDATE`: two concurrent
   * registrations of one token can never produce two owners, and a token
   * already held by another account moves to the caller (shared browser
   * after an account switch) together with the caller's session.
   */
  upsertByToken(db: Prisma.TransactionClient, input: RegisterDeviceInput): Promise<Device> {
    return db.device.upsert({
      where: { fcm_token: input.fcmToken },
      create: {
        user_id: input.userId,
        session_id: input.sessionId,
        fcm_token: input.fcmToken,
        platform: input.platform,
        app_version: input.appVersion,
      },
      update: {
        user_id: input.userId,
        session_id: input.sessionId,
        platform: input.platform,
        app_version: input.appVersion,
        last_seen_at: new Date(),
        version: { increment: 1 },
      },
    });
  }

  async detachRefreshTokensOnTransfer(db: Prisma.TransactionClient, deviceId: string, newUserId: string, newSessionId: string): Promise<void> {
    await db.refreshToken.updateMany({
      where: { device_id: deviceId, OR: [{ user_id: { not: newUserId } }, { session_id: { not: newSessionId } }] },
      data: { device_id: null },
    });
  }

  async deleteOwnedToken(db: Prisma.TransactionClient, userId: string, sessionId: string, fcmToken: string): Promise<number> {
    const result = await db.device.deleteMany({
      where: { user_id: userId, fcm_token: fcmToken, OR: [{ session_id: sessionId }, { session_id: null }] },
    });
    return result.count;
  }

  /**
   * Single-session logout: removes every token that session registered plus
   * the token the client presented (covers rows registered before
   * `session_id` existed). Always scoped to the session's own user, so a
   * token that has since moved to another account is never touched.
   */
  async deleteForSession(db: Prisma.TransactionClient, userId: string, sessionId: string, fcmToken?: string): Promise<number> {
    const result = await db.device.deleteMany({
      where: { user_id: userId, OR: [{ session_id: sessionId }, ...(fcmToken ? [{ fcm_token: fcmToken, session_id: null }] : [])] },
    });
    return result.count;
  }

  async deleteAllForUser(db: Prisma.TransactionClient, userId: string): Promise<number> {
    const result = await db.device.deleteMany({ where: { user_id: userId } });
    return result.count;
  }

  /**
   * Delete only rows that still match the owner/session snapshot used for
   * the send. An invalid-token response can arrive after that token moved to
   * another account or a newer login session; it must not delete that new
   * registration.
   */
  deleteTokensForOwnerSnapshot(db: Prisma.TransactionClient, userId: string, registrations: DeviceTokenRegistration[]): Promise<Prisma.BatchPayload> {
    if (registrations.length === 0) return Promise.resolve({ count: 0 });
    return db.device.deleteMany({
      where: {
        user_id: userId,
        OR: registrations.map(({ id, fcmToken, sessionId, version }) => ({
          id,
          fcm_token: fcmToken,
          session_id: sessionId,
          version,
        })),
      },
    });
  }

  /** File 12 Part 53: the only read Notifications needs — every currently-known `fcm_token` for a user, across however many devices they're logged into. */
  listTokensForUser(db: Prisma.TransactionClient, userId: string): Promise<DeviceTokenRegistration[]> {
    return db.device
      .findMany({ where: { user_id: userId }, select: { id: true, fcm_token: true, session_id: true, version: true } })
      .then((rows) => rows.map((row) => ({ id: row.id, fcmToken: row.fcm_token, sessionId: row.session_id, version: row.version })));
  }
}
