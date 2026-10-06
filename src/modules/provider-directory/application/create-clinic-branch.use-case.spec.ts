import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateClinicBranchUseCase } from './create-clinic-branch.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;
const input = { address: { line1: 'a' } as any, phone: '+20', ianaTimezone: 'Africa/Cairo' };

describe('CreateClinicBranchUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const clinics = { findById: jest.fn().mockResolvedValue({ id: 'c1' }) };
    const branches = { create: jest.fn().mockResolvedValue({ id: 'br1' }) };
    const addresses = { create: jest.fn().mockResolvedValue({ id: 'ad1' }) };
    const audit = { record: jest.fn() };
    const useCase = new CreateClinicBranchUseCase(prisma as any, clinics as any, branches as any, addresses as any, audit as any);
    return { tx, clinics, branches, addresses, audit, useCase };
  }

  it('404s when clinic is missing', async () => {
    const { useCase, clinics, addresses } = setup();
    clinics.findById.mockResolvedValue(null);
    await expect(useCase.execute('c1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(addresses.create).not.toHaveBeenCalled();
  });

  it('creates address and branch and audits', async () => {
    const { tx, useCase, branches, addresses, audit } = setup();
    await expect(useCase.execute('c1', input, actor)).resolves.toEqual({ id: 'br1' });
    expect(addresses.create).toHaveBeenCalledWith(tx, input.address);
    expect(branches.create).toHaveBeenCalledWith(tx, { clinicId: 'c1', addressId: 'ad1', phone: '+20', ianaTimezone: 'Africa/Cairo' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'br1', action: 'provider_directory.clinic_branch.create' }));
  });
});
