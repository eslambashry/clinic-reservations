import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../../../shared/config/config.module';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LogoutUseCase } from '../application/logout.use-case';
import { RegisterDeviceUseCase } from '../application/register-device.use-case';
import { generateRefreshToken, hashRefreshToken } from '../domain/refresh-token.util';
import { DeviceRepository } from './device.repository';
import { RefreshTokenRepository } from './refresh-token.repository';

dotenv.config();

/**
 * 2026-09-26 FCM ownership hardening: a registration still in flight when
 * the user logs out must never leave the token owned by the logged-out
 * account (nor move it back from the account that signed in next).
 *
 * Run against real Postgres because the guarantee is the row lock:
 * `RegisterDeviceUseCase` share-locks the session's live refresh token and
 * `LogoutUseCase` revokes it before deleting the session's devices. These
 * tests force each interleaving explicitly instead of relying on timing.
 */
describe('FCM device ownership vs logout (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let devices: DeviceRepository;
  let register: RegisterDeviceUseCase;
  let logout: LogoutUseCase;
  const userIds: string[] = [];

  async function newUser(): Promise<string> {
    const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const user = await prisma.user.create({ data: { phone: `+2013${digits}`, first_name: 'Device', last_name: 'Race' } });
    userIds.push(user.id);
    return user.id;
  }

  async function newSession(userId: string): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const sessionId = randomUUID();
    await prisma.refreshToken.create({
      data: { user_id: userId, token_hash: hashRefreshToken(refreshToken), session_id: sessionId, expires_at: new Date(Date.now() + 3_600_000) },
    });
    return { sessionId, refreshToken };
  }

  /** Resolves once another backend is blocked waiting on a row lock. */
  async function waitForLockWaiter(timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND (query ILIKE '%refresh_tokens%' OR query ILIKE '%users%')`;
      if (Number(rows[0].n) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('logout never blocked on the registration share lock');
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
      providers: [DeviceRepository, RefreshTokenRepository, RegisterDeviceUseCase, LogoutUseCase],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    devices = moduleRef.get(DeviceRepository);
    register = moduleRef.get(RegisterDeviceUseCase);
    logout = moduleRef.get(LogoutUseCase);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await moduleRef.close();
  });

  it('registration holding the session lock makes logout wait, and logout then removes the row it wrote', async () => {
    const userId = await newUser();
    const session = await newSession(userId);
    const fcmToken = `race-${randomUUID()}`;

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let lockHeld!: () => void;
    const lockHeldSignal = new Promise<void>((resolve) => { lockHeld = resolve; });
    const original = devices.upsertByToken.bind(devices);
    jest.spyOn(devices, 'upsertByToken').mockImplementation(async (tx, input) => {
      lockHeld(); // lockLiveSession already ran inside this same transaction
      await gate;
      return original(tx, input);
    });

    const registration = register.execute({ userId, sessionId: session.sessionId, fcmToken, platform: 'web' });
    await lockHeldSignal;
    const loggingOut = logout.execute({ refreshToken: session.refreshToken });
    await waitForLockWaiter();
    releaseGate();

    await expect(registration).resolves.toMatchObject({ deviceId: expect.any(String) });
    await expect(loggingOut).resolves.toBeUndefined();
    expect(await prisma.device.count({ where: { fcm_token: fcmToken } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { session_id: session.sessionId, revoked_at: null } })).toBe(0);
  });

  it('registration arriving after logout committed is rejected with 409 and writes nothing', async () => {
    const userId = await newUser();
    const session = await newSession(userId);
    const fcmToken = `race-${randomUUID()}`;

    await logout.execute({ refreshToken: session.refreshToken });

    await expect(register.execute({ userId, sessionId: session.sessionId, fcmToken, platform: 'web' }))
      .rejects.toMatchObject({ httpStatus: 409, code: 'DEVICE_SESSION_ENDED' });
    expect(await prisma.device.count({ where: { fcm_token: fcmToken } })).toBe(0);
  });

  it("a logged-out account's late registration cannot move the token back from the next account", async () => {
    const userA = await newUser();
    const userB = await newUser();
    const sessionA = await newSession(userA);
    const sessionB = await newSession(userB);
    const fcmToken = `race-${randomUUID()}`;

    await register.execute({ userId: userA, sessionId: sessionA.sessionId, fcmToken, platform: 'web' });
    await logout.execute({ refreshToken: sessionA.refreshToken });
    await register.execute({ userId: userB, sessionId: sessionB.sessionId, fcmToken, platform: 'web' });

    await expect(register.execute({ userId: userA, sessionId: sessionA.sessionId, fcmToken, platform: 'web' }))
      .rejects.toMatchObject({ code: 'DEVICE_SESSION_ENDED' });
    const rows = await prisma.device.findMany({ where: { fcm_token: fcmToken } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: userB, session_id: sessionB.sessionId });
  });

  it('two accounts registering one brand-new token concurrently never produce two owners', async () => {
    const userA = await newUser();
    const userB = await newUser();
    const sessionA = await newSession(userA);
    const sessionB = await newSession(userB);
    const fcmToken = `race-${randomUUID()}`;

    const results = await Promise.allSettled([
      register.execute({ userId: userA, sessionId: sessionA.sessionId, fcmToken, platform: 'web' }),
      register.execute({ userId: userB, sessionId: sessionB.sessionId, fcmToken, platform: 'web' }),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const rows = await prisma.device.findMany({ where: { fcm_token: fcmToken } });
    expect(rows).toHaveLength(1);
    expect([userA, userB]).toContain(rows[0].user_id);
  });

  it('under unordered concurrent register + logout, the logged-out session never ends up owning the token', async () => {
    for (let i = 0; i < 15; i += 1) {
      const userId = await newUser();
      const session = await newSession(userId);
      const fcmToken = `race-${randomUUID()}`;

      await Promise.allSettled([
        register.execute({ userId, sessionId: session.sessionId, fcmToken, platform: 'android' }),
        logout.execute({ refreshToken: session.refreshToken }),
      ]);

      expect(await prisma.device.count({ where: { fcm_token: fcmToken } })).toBe(0);
    }
  });

  it('logout of one session leaves the same user\'s other sessions and devices alone', async () => {
    const userId = await newUser();
    const phone = await newSession(userId);
    const browser = await newSession(userId);
    const phoneToken = `race-${randomUUID()}`;
    const browserToken = `race-${randomUUID()}`;
    await register.execute({ userId, sessionId: phone.sessionId, fcmToken: phoneToken, platform: 'android' });
    await register.execute({ userId, sessionId: browser.sessionId, fcmToken: browserToken, platform: 'web' });

    await logout.execute({ refreshToken: browser.refreshToken });

    expect(await prisma.device.count({ where: { fcm_token: browserToken } })).toBe(0);
    expect(await prisma.device.count({ where: { fcm_token: phoneToken, user_id: userId } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { session_id: phone.sessionId, revoked_at: null } })).toBe(1);
  });

  it('a stale invalid-token response cannot prune the token after it moves to a newer session of the same user', async () => {
    const userId = await newUser();
    const oldSession = await newSession(userId);
    const nextSession = await newSession(userId);
    const fcmToken = `race-${randomUUID()}`;
    await register.execute({ userId, sessionId: oldSession.sessionId, fcmToken, platform: 'web' });
    const sentSnapshot = await devices.listTokensForUser(prisma, userId);

    await register.execute({ userId, sessionId: nextSession.sessionId, fcmToken, platform: 'web' });
    const deleted = await devices.deleteTokensForOwnerSnapshot(prisma, userId, sentSnapshot);

    expect(deleted.count).toBe(0);
    expect(await prisma.device.findUnique({ where: { fcm_token: fcmToken } })).toMatchObject({
      user_id: userId,
      session_id: nextSession.sessionId,
      version: 2,
    });
  });

  it('same-user session transfer detaches refresh tokens bound to the old device session', async () => {
    const userId = await newUser();
    const oldSession = await newSession(userId);
    const nextSession = await newSession(userId);
    const fcmToken = `race-${randomUUID()}`;
    await register.execute({ userId, sessionId: oldSession.sessionId, fcmToken, platform: 'web' });
    const device = await prisma.device.findUniqueOrThrow({ where: { fcm_token: fcmToken } });
    await prisma.refreshToken.updateMany({
      where: { user_id: userId, session_id: { in: [oldSession.sessionId, nextSession.sessionId] } },
      data: { device_id: device.id },
    });

    await register.execute({ userId, sessionId: nextSession.sessionId, fcmToken, platform: 'web' });

    expect(await prisma.refreshToken.findUniqueOrThrow({ where: { token_hash: hashRefreshToken(oldSession.refreshToken) } }))
      .toMatchObject({ device_id: null });
    expect(await prisma.refreshToken.findUniqueOrThrow({ where: { token_hash: hashRefreshToken(nextSession.refreshToken) } }))
      .toMatchObject({ device_id: device.id });
  });
});
