import { Prisma } from '@prisma/client';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { ProvisionStaffUserUseCase } from './provision-staff-user.use-case';

const input = { phone: '+201000000000', displayName: 'Sara', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doc-1' };
const own = { role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'doc-1' };

function setup() {
  const tx: any = {};
  const users = {
    findByPhone: jest.fn(),
    lockForAuthMutation: jest.fn(),
    create: jest.fn(),
    setPassword: jest.fn(),
    updateProfile: jest.fn(),
    setStatus: jest.fn(),
  };
  const roleMemberships = { findAllByUser: jest.fn(), findByUserRoleContext: jest.fn(), setStatus: jest.fn(), create: jest.fn() };
  const useCase = new ProvisionStaffUserUseCase(users as any, roleMemberships as any);
  return { tx, users, roleMemberships, useCase };
}

describe('ProvisionStaffUserUseCase (extra paths)', () => {
  it('throws STAFF_IDENTITY_CONFLICT when the owner membership exists but identity is not exclusive', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'u' });
    roleMemberships.findAllByUser.mockResolvedValue([own, { role_code: 'PATIENT', context_type: 'PATIENT', context_id: null }]);
    roleMemberships.findByUserRoleContext.mockResolvedValue({ id: 'm', status: 'REVOKED' });
    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'STAFF_IDENTITY_CONFLICT' });
  });

  it('throws PHONE_ALREADY_REGISTERED when a non-staff history blocks it', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'u' });
    roleMemberships.findAllByUser.mockResolvedValue([{ role_code: 'PATIENT', context_type: 'PATIENT', context_id: null }]);
    roleMemberships.findByUserRoleContext.mockResolvedValue(null);
    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED' });
  });

  it('throws PHONE_ALREADY_REGISTERED when the user has no membership at all (no employee proof)', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'u' });
    roleMemberships.findAllByUser.mockResolvedValue([]);
    roleMemberships.findByUserRoleContext.mockResolvedValue(null);
    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED' });
  });

  it('resets a SUSPENDED user to ACTIVE when reactivating, keeping the stored name when present', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue({ id: 'u' });
    roleMemberships.findAllByUser.mockResolvedValue([own]);
    const existing = { id: 'm', status: 'REVOKED', version: 4, created_at: new Date('2026-01-01') };
    roleMemberships.findByUserRoleContext.mockResolvedValue(existing);
    users.setPassword.mockResolvedValue({ id: 'u', status: 'SUSPENDED' });
    users.updateProfile.mockResolvedValue({ id: 'u', status: 'SUSPENDED', phone: input.phone, first_name: null });
    users.setStatus.mockResolvedValue({ id: 'u', status: 'ACTIVE', phone: input.phone, first_name: 'Stored' });
    const result = await useCase.execute(tx, input);
    expect(users.setStatus).toHaveBeenCalledWith(tx, 'u', 'ACTIVE');
    expect(roleMemberships.setStatus).toHaveBeenCalledWith(tx, 'm', 4, 'ACTIVE');
    expect(roleMemberships.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ userId: 'u', roleMembershipId: 'm', displayName: 'Stored', status: 'ACTIVE' });
    expect(result.generatedPassword).toBeTruthy();
  });

  it('falls back to input displayName when the user has no first_name', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'u' });
    users.setPassword.mockResolvedValue({ id: 'u' });
    users.updateProfile.mockResolvedValue({ id: 'u', status: 'ACTIVE', phone: input.phone, first_name: null });
    roleMemberships.create.mockResolvedValue({ id: 'm', created_at: new Date() });
    const result = await useCase.execute(tx, input);
    expect(result.displayName).toBe('Sara');
    expect(users.setStatus).not.toHaveBeenCalled();
  });

  it('maps a P2002 race on membership creation to STAFF_ALREADY_PROVISIONED', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'u' });
    users.setPassword.mockResolvedValue({ id: 'u' });
    users.updateProfile.mockResolvedValue({ id: 'u', status: 'ACTIVE' });
    roleMemberships.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const err = await useCase.execute(tx, input).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('STAFF_ALREADY_PROVISIONED');
  });

  it('rethrows unexpected membership creation errors', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'u' });
    users.setPassword.mockResolvedValue({ id: 'u' });
    users.updateProfile.mockResolvedValue({ id: 'u', status: 'ACTIVE' });
    const boom = new Error('db down');
    roleMemberships.create.mockRejectedValue(boom);
    await expect(useCase.execute(tx, input)).rejects.toBe(boom);
  });
});
