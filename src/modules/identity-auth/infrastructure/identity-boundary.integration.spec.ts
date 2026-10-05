import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, RoleMembership } from '@prisma/client';
import { ProvisionStaffUserUseCase } from '../application/provision-staff-user.use-case';
import { UpdateStaffMembershipUseCase } from '../application/update-staff-membership.use-case';
import { DeviceRepository } from './device.repository';
import { PermissionRepository } from './permission.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RoleMembershipRepository } from './role-membership.repository';
import { TokenService } from './token.service';
import { UserRepository } from './user.repository';

/** Only `test:integration`, whose setup requires an explicit disposable TEST_DATABASE_URL. */
describe('managed employee and suspended identity boundary (real Postgres)', () => {
  const prisma = new PrismaClient();
  const refresh = new RefreshTokenRepository();
  const devices = new DeviceRepository();
  const users = new UserRepository(refresh, devices);
  const memberships = new RoleMembershipRepository();
  const provision = new ProvisionStaffUserUseCase(users, memberships);
  const updateStaff = new UpdateStaffMembershipUseCase(users, memberships);
  const tokens = new TokenService(
    new JwtService({ secret: 'disposable-identity-boundary-fixture-key', signOptions: { expiresIn: 900 } }),
    new ConfigService({ jwt: { accessTtlSeconds: 900, refreshTtlSeconds: 3600 } }),
    refresh,
    new PermissionRepository(),
  );
  const userIds: string[] = [];

  async function newUser() {
    const user = await prisma.user.create({ data: { phone: `+2013${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` } });
    userIds.push(user.id);
    return user;
  }

  async function patient() {
    const user = await newUser();
    const membership = await prisma.$transaction((tx) => memberships.create(tx, { userId: user.id, roleCode: 'PATIENT', contextType: 'PATIENT' }));
    return { user, membership };
  }

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  async function waitForUserLockWaiter() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%users%'`;
      if (Number(rows[0].count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('the competing identity mutation never waited on the user lock');
  }

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await prisma.device.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.roleMembership.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('keeps OTP-only patient credentials, profile, status and memberships untouched on employee provisioning', async () => {
    const { user } = await patient();
    await expect(prisma.$transaction((tx) => provision.execute(tx, { phone: user.phone, displayName: 'Employee', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', contextId: randomUUID() }))).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toEqual(user);
    expect(await prisma.roleMembership.count({ where: { user_id: user.id } })).toBe(1);
  });

  it('preserves new employee provisioning and exact-owner revoked reactivation, then rejects a personal role grant', async () => {
    const phone = `+2013${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const input = { phone, displayName: 'Employee', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as const, contextId: randomUUID() };
    const created = await prisma.$transaction((tx) => provision.execute(tx, input));
    userIds.push(created.userId);
    const membership = await prisma.roleMembership.findUniqueOrThrow({ where: { id: created.roleMembershipId } });
    await prisma.$transaction((tx) => memberships.setStatus(tx, membership.id, membership.version, 'REVOKED'));
    const reactivated = await prisma.$transaction((tx) => provision.execute(tx, input));
    expect(reactivated.roleMembershipId).toBe(created.roleMembershipId);
    expect(reactivated.status).toBe('ACTIVE');
    await expect(prisma.$transaction((tx) => memberships.create(tx, { userId: created.userId, roleCode: 'DOCTOR', contextType: 'DOCTOR' }))).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(await prisma.roleMembership.count({ where: { user_id: created.userId } })).toBe(1);
  });

  it('denies owner PATCH and real token rotation on historical mixed identities without altering their global user row', async () => {
    const { user, membership } = await patient();
    const ownerId = randomUUID();
    // Simulate pre-fix retained data; production callers cannot create this combination anymore.
    const staff = await prisma.roleMembership.create({ data: { user_id: user.id, role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: ownerId } });
    await expect(prisma.$transaction((tx) => updateStaff.execute(tx, { roleMembershipId: staff.id, roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', contextId: ownerId, password: 'OwnerPassword1!', displayName: 'Replacement', status: 'SUSPENDED' }))).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    await expect(prisma.$transaction((tx) => tokens.rotate(tx, membership, randomUUID(), randomUUID()))).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toEqual(user);
    expect(await prisma.refreshToken.count({ where: { user_id: user.id } })).toBe(0);
  });

  it('suspension waiting behind issuance revokes that newly issued refresh token before returning', async () => {
    const { user, membership } = await patient();
    const acquired = deferred();
    const release = deferred();
    const original = refresh.lockUserForAuthMutation.bind(refresh);
    jest.spyOn(refresh, 'lockUserForAuthMutation').mockImplementationOnce(async (tx, userId) => {
      await original(tx, userId);
      acquired.resolve();
      await release.promise;
    });
    const issuing = prisma.$transaction((tx) => tokens.issue(tx, membership), { timeout: 10000 });
    await acquired.promise;
    const suspending = prisma.$transaction((tx) => users.setStatus(tx, user.id, 'SUSPENDED'), { timeout: 10000 });
    try { await waitForUserLockWaiter(); } finally { release.resolve(); }
    await Promise.all([issuing, suspending]);
    expect(await prisma.refreshToken.count({ where: { user_id: user.id, revoked_at: null } })).toBe(0);
    expect(await prisma.device.count({ where: { user_id: user.id } })).toBe(0);
    await expect(prisma.$transaction((tx) => tokens.issue(tx, membership))).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
  });

  it('issuance waiting behind suspension rechecks SUSPENDED and never creates a token', async () => {
    const { user, membership } = await patient();
    const changed = deferred();
    const release = deferred();
    const original = devices.deleteAllForUser.bind(devices);
    jest.spyOn(devices, 'deleteAllForUser').mockImplementationOnce(async (tx, userId) => {
      const result = await original(tx, userId);
      changed.resolve();
      await release.promise;
      return result;
    });
    const suspending = prisma.$transaction((tx) => users.setStatus(tx, user.id, 'SUSPENDED'), { timeout: 10000 });
    await changed.promise;
    // Convert rejection into data immediately to avoid an unhandled promise
    // while waiting for PostgreSQL to prove the intended interleaving.
    const issuing = prisma.$transaction((tx) => tokens.issue(tx, membership as RoleMembership), { timeout: 10000 }).then(() => null, (error: unknown) => error);
    try { await waitForUserLockWaiter(); } finally { release.resolve(); }
    await suspending;
    expect(await issuing).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
    expect(await prisma.refreshToken.count({ where: { user_id: user.id } })).toBe(0);
  });
});
