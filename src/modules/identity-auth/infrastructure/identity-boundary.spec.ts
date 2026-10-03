import { TokenService } from './token.service';
import { RoleMembershipRepository } from './role-membership.repository';
import { UserRepository } from './user.repository';
import { ProvisionStaffUserUseCase } from '../application/provision-staff-user.use-case';
import { UpdateStaffMembershipUseCase } from '../application/update-staff-membership.use-case';

jest.mock('@node-rs/argon2', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

const personal = { id: 'patient-membership', user_id: 'user-1', role_code: 'PATIENT', context_type: 'PATIENT', context_id: null, status: 'ACTIVE' } as any;
const staff = { id: 'staff-membership', user_id: 'user-1', role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'doctor-1', status: 'ACTIVE', version: 1, created_at: new Date() } as any;
const input = { phone: '+201001234567', displayName: 'Employee', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doctor-1' };

describe('managed employee identity boundary', () => {
  function provisionSetup(history: any[], existing = null as any) {
    const user = { id: 'user-1', phone: input.phone, password_hash: null, first_name: 'Patient', status: 'ACTIVE' };
    const users = { findByPhone: jest.fn().mockResolvedValue(user), lockForAuthMutation: jest.fn(), create: jest.fn(), setPassword: jest.fn().mockResolvedValue(user), updateProfile: jest.fn().mockResolvedValue(user), setStatus: jest.fn() };
    const memberships = { findAllByUser: jest.fn().mockResolvedValue(history), findByUserRoleContext: jest.fn().mockResolvedValue(existing), findActiveByUserRoleContextType: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue(staff), setStatus: jest.fn() };
    return { users, memberships, useCase: new ProvisionStaffUserUseCase(users as any, memberships as any) };
  }

  it('never overwrites an OTP-only patient identity or creates employee access for its phone', async () => {
    const { users, memberships, useCase } = provisionSetup([personal]);
    await expect(useCase.execute({} as any, input)).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED' });
    expect(users.create).not.toHaveBeenCalled();
    expect(users.setPassword).not.toHaveBeenCalled();
    expect(users.updateProfile).not.toHaveBeenCalled();
    expect(users.setStatus).not.toHaveBeenCalled();
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'REVOKED'])('rejects mixed personal history even when the exact owner employee membership is revoked (%s personal)', async (status) => {
    const revoked = { ...staff, status: 'REVOKED' };
    const { users, memberships, useCase } = provisionSetup([revoked, { ...personal, status }], revoked);
    await expect(useCase.execute({} as any, input)).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(users.setPassword).not.toHaveBeenCalled();
    expect(memberships.setStatus).not.toHaveBeenCalled();
  });

  it('owner PATCH cannot change global credentials, name or status on a mixed legacy identity', async () => {
    const users = { lockForAuthMutation: jest.fn(), setPassword: jest.fn(), updateProfile: jest.fn(), setStatus: jest.fn() };
    const memberships = { findByIdForContext: jest.fn().mockResolvedValue({ ...staff, user: { id: 'user-1' } }), findAllByUser: jest.fn().mockResolvedValue([staff, { ...personal, status: 'REVOKED' }]) };
    const useCase = new UpdateStaffMembershipUseCase(users as any, memberships as any);
    await expect(useCase.execute({} as any, { ...input, roleMembershipId: staff.id, password: 'NewPassword1!', status: 'SUSPENDED' })).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(users.updateProfile).not.toHaveBeenCalled();
    expect(users.setPassword).not.toHaveBeenCalled();
    expect(users.setStatus).not.toHaveBeenCalled();
  });
});

describe('real role membership writer', () => {
  function setup(history: any[]) {
    const db = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]), roleMembership: { findMany: jest.fn().mockResolvedValue(history), create: jest.fn().mockResolvedValue(personal) } } as any;
    return { db, repository: new RoleMembershipRepository() };
  }

  it.each(['ACTIVE', 'REVOKED'])('blocks a later personal role grant to an owner-managed identity with %s staff history', async (status) => {
    const { db, repository } = setup([{ ...staff, status }]);
    await expect(repository.create(db, { userId: 'user-1', roleCode: 'PATIENT', contextType: 'PATIENT' })).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(db.roleMembership.create).not.toHaveBeenCalled();
  });

  it('blocks changing the owner or staff role after revocation', async () => {
    const { db, repository } = setup([{ ...staff, status: 'REVOKED' }]);
    await expect(repository.create(db, { userId: 'user-1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', contextId: 'doctor-2' })).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(db.roleMembership.create).not.toHaveBeenCalled();
  });

  it.each([
    { roleCode: 'DOCTOR', contextType: 'DOCTOR' },
    { roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', contextId: 'branch-1' },
  ])('blocks owner-known credentials from becoming $roleCode after staff revocation', async (candidate) => {
    const { db, repository } = setup([{ ...staff, status: 'REVOKED' }]);
    await expect(repository.create(db, { userId: 'user-1', ...candidate } as any)).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(db.roleMembership.create).not.toHaveBeenCalled();
  });

  it.each([
    { roleCode: 'CLINIC_STAFF', contextType: 'PATIENT', contextId: 'doctor-1' },
    { roleCode: 'PATIENT', contextType: 'CLINIC_STAFF', contextId: 'doctor-1' },
    { roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' },
  ])('rejects malformed employee scope $roleCode/$contextType', async (candidate) => {
    const { db, repository } = setup([]);
    await expect(repository.create(db, { userId: 'user-1', ...candidate } as any)).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(db.roleMembership.create).not.toHaveBeenCalled();
  });

  it('preserves a personal PATIENT becoming DOCTOR and reads history after acquiring the user lock', async () => {
    const { db, repository } = setup([personal]);
    await repository.create(db, { userId: 'user-1', roleCode: 'DOCTOR', contextType: 'DOCTOR' });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.roleMembership.findMany.mock.invocationCallOrder[0]);
    expect(db.roleMembership.create).toHaveBeenCalled();
  });
});

describe('real token issuance boundary', () => {
  function setup(status: string, history: any[] = [personal]) {
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ status, deleted_at: null }) }, roleMembership: { findMany: jest.fn().mockResolvedValue(history) } } as any;
    const jwt = { signAsync: jest.fn().mockResolvedValue('access') };
    const config = { get: jest.fn().mockReturnValue(900) };
    const refresh = { lockUserForAuthMutation: jest.fn(), create: jest.fn() };
    const permissions = { findCodesByRole: jest.fn().mockResolvedValue([]) };
    return { db, jwt, refresh, permissions, service: new TokenService(jwt as any, config as any, refresh as any, permissions as any) };
  }

  it.each(['issue', 'rotate'])('rejects SUSPENDED at the real %s boundary before permissions, signing and token writes', async (method) => {
    const { db, jwt, refresh, permissions, service } = setup('SUSPENDED');
    const call = method === 'issue' ? service.issue(db, personal) : service.rotate(db, personal, 'previous', 'session');
    await expect(call).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE', httpStatus: 401 });
    expect(refresh.lockUserForAuthMutation).toHaveBeenCalledWith(db, 'user-1');
    expect(permissions.findCodesByRole).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(refresh.create).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'REVOKED'])('denies legacy mixed staff/personal history (%s staff) before issuing usable personal credentials', async (status) => {
    const { db, jwt, refresh, service } = setup('ACTIVE', [personal, { ...staff, status }]);
    await expect(service.rotate(db, personal, 'previous', 'session')).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT', httpStatus: 401 });
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(refresh.create).not.toHaveBeenCalled();
  });

  it('preserves ACTIVE personal PATIENT+DOCTOR issuance and checks the current identity under lock', async () => {
    const { db, jwt, refresh, service } = setup('ACTIVE', [personal, { ...personal, id: 'doctor-membership', role_code: 'DOCTOR', context_type: 'DOCTOR' }]);
    await expect(service.issue(db, personal)).resolves.toMatchObject({ accessToken: 'access' });
    expect(refresh.lockUserForAuthMutation.mock.invocationCallOrder[0]).toBeLessThan(db.user.findUnique.mock.invocationCallOrder[0]);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ roleCode: 'PATIENT' }));
    expect(refresh.create).toHaveBeenCalled();
  });

  it('preserves ACTIVE employee issuance only for the same managed owner identity', async () => {
    const { db, service } = setup('ACTIVE', [staff]);
    await expect(service.issue(db, staff)).resolves.toMatchObject({ accessToken: 'access' });
  });

  it('does not issue from a membership revoked while the caller waited for the identity lock', async () => {
    const { db, jwt, refresh, service } = setup('ACTIVE', [{ ...personal, status: 'REVOKED' }]);
    await expect(service.issue(db, personal)).rejects.toMatchObject({ code: 'SESSION_REFRESH_REQUIRED' });
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(refresh.create).not.toHaveBeenCalled();
  });

  it('does not issue for a soft-deleted identity whose status still says ACTIVE', async () => {
    const { db, jwt, service } = setup('ACTIVE');
    db.user.findUnique.mockResolvedValue({ status: 'ACTIVE', deleted_at: new Date() });
    await expect(service.issue(db, personal)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});

describe('real global identity mutations', () => {
  function setup(history = [staff]) {
    const db = { user: { update: jest.fn().mockResolvedValue({ id: 'user-1', status: 'SUSPENDED' }) }, roleMembership: { findMany: jest.fn().mockResolvedValue(history) } } as any;
    const refresh = { lockUserForAuthMutation: jest.fn(), revokeAllActiveForUser: jest.fn() };
    const devices = { deleteAllForUser: jest.fn() };
    return { db, refresh, devices, repository: new UserRepository(refresh as any, devices as any) };
  }

  it('suspends under the issuance lock and removes every refresh session and device before returning', async () => {
    const { db, refresh, devices, repository } = setup();
    await repository.setStatus(db, 'user-1', 'SUSPENDED');
    expect(refresh.lockUserForAuthMutation).toHaveBeenCalledWith(db, 'user-1');
    expect(refresh.revokeAllActiveForUser).toHaveBeenCalledWith(db, 'user-1');
    expect(devices.deleteAllForUser).toHaveBeenCalledWith(db, 'user-1');
    expect(refresh.lockUserForAuthMutation.mock.invocationCallOrder[0]).toBeLessThan(db.user.update.mock.invocationCallOrder[0]);
    expect(db.user.update.mock.invocationCallOrder[0]).toBeLessThan(refresh.revokeAllActiveForUser.mock.invocationCallOrder[0]);
  });

  it('preserves explicit staff reactivation without revoking newly permitted sessions', async () => {
    const { db, refresh, devices, repository } = setup();
    await repository.setStatus(db, 'user-1', 'ACTIVE');
    expect(refresh.lockUserForAuthMutation).toHaveBeenCalledWith(db, 'user-1');
    expect(refresh.revokeAllActiveForUser).not.toHaveBeenCalled();
    expect(devices.deleteAllForUser).not.toHaveBeenCalled();
  });

  it('rejects password writes to mixed legacy identities at the shared credential writer too', async () => {
    const { db, repository } = setup([staff, { ...personal, status: 'REVOKED' }]);
    await expect(repository.setPassword(db, 'user-1', 'replacement-hash')).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
