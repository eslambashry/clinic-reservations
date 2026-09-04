import * as argon2 from '@node-rs/argon2';
import { ProvisionStaffUserUseCase } from './provision-staff-user.use-case';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

function buildTx() {
  return {} as any;
}

const baseInput = {
  phone: '+201001234567',
  displayName: 'Sara Ahmed',
  roleCode: 'CLINIC_STAFF',
  contextType: 'CLINIC_STAFF' as any,
  contextId: 'doctor-1',
};

describe('ProvisionStaffUserUseCase', () => {
  function setup() {
    const tx = buildTx();
    const users = {
      findByPhone: jest.fn(),
      create: jest.fn(),
      setPassword: jest.fn(),
      updateProfile: jest.fn(),
      setStatus: jest.fn(),
    };
    const roleMemberships = {
      findByUserRoleContext: jest.fn(),
      findActiveByUserRoleContextType: jest.fn(),
      create: jest.fn(),
      setStatus: jest.fn(),
    };
    const useCase = new ProvisionStaffUserUseCase(users as any, roleMemberships as any);
    return { tx, users, roleMemberships, useCase };
  }

  it('creates a brand new user and membership when the phone is unknown, and returns the plaintext generated password exactly once', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, first_name: 'Sara Ahmed', status: 'ACTIVE' });
    users.setPassword.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, first_name: 'Sara Ahmed', status: 'ACTIVE' });
    users.updateProfile.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, first_name: 'Sara Ahmed', status: 'ACTIVE' });
    roleMemberships.create.mockResolvedValue({ id: 'membership-1', created_at: new Date('2026-09-04T00:00:00Z') });

    const result = await useCase.execute(tx, baseInput);

    expect(users.create).toHaveBeenCalledWith(tx, baseInput.phone, baseInput.displayName);
    expect(roleMemberships.create).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      roleCode: 'CLINIC_STAFF',
      contextType: 'CLINIC_STAFF',
      contextId: 'doctor-1',
    });
    expect(result.generatedPassword).toEqual(expect.any(String));
    expect(result.generatedPassword.length).toBeGreaterThanOrEqual(8);
    expect(result.roleMembershipId).toBe('membership-1');
    expect(argon2.hash).toHaveBeenCalledWith(result.generatedPassword);
    expect(users.setPassword).toHaveBeenCalledWith(tx, 'user-1', 'hashed-password');
  });

  it('409s STAFF_ALREADY_PROVISIONED when this exact phone is already an ACTIVE staff member for this owner', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, password_hash: null, status: 'ACTIVE' });
    roleMemberships.findByUserRoleContext.mockResolvedValue({ id: 'membership-1', status: 'ACTIVE', context_id: 'doctor-1', version: 1 });

    await expect(useCase.execute(tx, baseInput)).rejects.toMatchObject({ code: 'STAFF_ALREADY_PROVISIONED', httpStatus: 409 });
    expect(users.setPassword).not.toHaveBeenCalled();
  });

  it('409s STAFF_ASSIGNED_ELSEWHERE when this phone already has an ACTIVE staff membership under a different owner', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, password_hash: null, status: 'ACTIVE' });
    roleMemberships.findByUserRoleContext.mockResolvedValue(null);
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([{ context_id: 'doctor-2' }]);

    await expect(useCase.execute(tx, baseInput)).rejects.toMatchObject({ code: 'STAFF_ASSIGNED_ELSEWHERE', httpStatus: 409 });
  });

  it('409s PHONE_ALREADY_REGISTERED when the phone belongs to an existing account that already has a password set', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'user-1', phone: baseInput.phone, password_hash: 'some-hash', status: 'ACTIVE' });
    roleMemberships.findByUserRoleContext.mockResolvedValue(null);
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([]);

    await expect(useCase.execute(tx, baseInput)).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED', httpStatus: 409 });
  });

  it('reuses an existing password-less user (e.g. an OTP-only patient shell) and grants a new staff membership', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    const existingUser = { id: 'user-1', phone: baseInput.phone, password_hash: null, status: 'ACTIVE', first_name: null };
    users.findByPhone.mockResolvedValue(existingUser);
    roleMemberships.findByUserRoleContext.mockResolvedValue(null);
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([]);
    users.setPassword.mockResolvedValue(existingUser);
    users.updateProfile.mockResolvedValue({ ...existingUser, first_name: baseInput.displayName });
    roleMemberships.create.mockResolvedValue({ id: 'membership-1', created_at: new Date() });

    const result = await useCase.execute(tx, baseInput);

    expect(users.create).not.toHaveBeenCalled();
    expect(result.displayName).toBe(baseInput.displayName);
  });

  it('reactivates a previously revoked membership for the same phone/owner instead of inserting a new row, even though the user already has a password_hash set from the original provisioning', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    const existingUser = { id: 'user-1', phone: baseInput.phone, password_hash: 'old-hashed-password', status: 'SUSPENDED', first_name: 'Old Name' };
    users.findByPhone.mockResolvedValue(existingUser);
    const revoked = { id: 'membership-1', status: 'REVOKED', context_id: 'doctor-1', version: 2, created_at: new Date('2026-01-01T00:00:00Z') };
    roleMemberships.findByUserRoleContext.mockResolvedValue(revoked);
    roleMemberships.findActiveByUserRoleContextType.mockResolvedValue([]);
    users.setPassword.mockResolvedValue(existingUser);
    users.updateProfile.mockResolvedValue({ ...existingUser, first_name: baseInput.displayName });
    users.setStatus.mockResolvedValue({ ...existingUser, first_name: baseInput.displayName, status: 'ACTIVE' });

    const result = await useCase.execute(tx, baseInput);

    expect(roleMemberships.create).not.toHaveBeenCalled();
    expect(roleMemberships.setStatus).toHaveBeenCalledWith(tx, 'membership-1', 2, 'ACTIVE');
    // The user was left SUSPENDED by an earlier PATCH before being revoked —
    // reactivating must bring their account back to ACTIVE too, not just the membership.
    expect(users.setStatus).toHaveBeenCalledWith(tx, 'user-1', 'ACTIVE');
    expect(result.roleMembershipId).toBe('membership-1');
    expect(result.status).toBe('ACTIVE');
  });
});
