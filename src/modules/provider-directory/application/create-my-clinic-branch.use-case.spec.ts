import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateMyClinicBranchUseCase } from './create-my-clinic-branch.use-case';

const actor = { sub: 'u1', roleMembershipId: 'rm1' } as any;
const input = {
  clinicId: 'c1', phone: '+2010', ianaTimezone: 'Africa/Cairo',
  address: { line1: 'a', city: 'c', regionCode: 'r', countryCode: 'EG' }, consultFee: 150, currency: 'EGP',
};

describe('CreateMyClinicBranchUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scope = { execute: jest.fn().mockResolvedValue({ doctorId: 'd1', affiliations: [{ clinicId: 'c1' }] }) };
    const addresses = { create: jest.fn().mockResolvedValue({ id: 'ad1' }) };
    const branches = { create: jest.fn().mockResolvedValue({ id: 'br1' }) };
    const affiliations = { create: jest.fn().mockResolvedValue({ id: 'aff1' }) };
    const audit = { record: jest.fn() };
    const list = { execute: jest.fn().mockResolvedValue({ items: [{ affiliationId: 'aff1' }] }) };
    const useCase = new CreateMyClinicBranchUseCase(prisma as any, scope as any, addresses as any, branches as any, affiliations as any, audit as any, list as any);
    return { tx, scope, addresses, branches, affiliations, audit, list, useCase };
  }

  it('404s when doctor not affiliated with clinic', async () => {
    const { scope, useCase, addresses } = setup();
    scope.execute.mockResolvedValue({ doctorId: 'd1', affiliations: [{ clinicId: 'zzz' }] });
    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(addresses.create).not.toHaveBeenCalled();
  });

  it('creates address, branch, affiliation and audits', async () => {
    const { tx, useCase, addresses, branches, affiliations, audit } = setup();
    const res = await useCase.execute(input, actor);
    expect(addresses.create).toHaveBeenCalledWith(tx, input.address);
    expect(branches.create).toHaveBeenCalledWith(tx, { clinicId: 'c1', addressId: 'ad1', phone: '+2010', ianaTimezone: 'Africa/Cairo' });
    expect(affiliations.create).toHaveBeenCalledWith(tx, { doctorId: 'd1', clinicBranchId: 'br1', consultFee: '150.00', currency: 'EGP' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'br1' }));
    expect(res).toEqual({ affiliationId: 'aff1' });
  });

  it('404s when created affiliation is missing from refreshed list', async () => {
    const { useCase, list } = setup();
    list.execute.mockResolvedValue({ items: [] });
    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });
});
