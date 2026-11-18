import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreatePharmacyBranchUseCase } from './create-pharmacy-branch.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;
const input = { address: { line1: 'a' } as any, phone: '+20', ianaTimezone: 'Africa/Cairo', deliveryCapable: true };

describe('CreatePharmacyBranchUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const branches = { create: jest.fn().mockResolvedValue({ id: 'br1' }) };
    const addresses = { create: jest.fn().mockResolvedValue({ id: 'ad1' }) };
    const audit = { record: jest.fn() };
    const useCase = new CreatePharmacyBranchUseCase(prisma as any, pharmacies as any, branches as any, addresses as any, audit as any);
    return { tx, pharmacies, branches, addresses, audit, useCase };
  }

  it('404s when pharmacy is missing', async () => {
    const { useCase, pharmacies, addresses } = setup();
    pharmacies.findById.mockResolvedValue(null);
    await expect(useCase.execute('p1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(addresses.create).not.toHaveBeenCalled();
  });

  it('creates address and branch and audits', async () => {
    const { tx, useCase, branches, audit } = setup();
    await expect(useCase.execute('p1', input, actor)).resolves.toEqual({ id: 'br1' });
    expect(branches.create).toHaveBeenCalledWith(tx, {
      pharmacyId: 'p1', addressId: 'ad1', phone: '+20', ianaTimezone: 'Africa/Cairo', deliveryCapable: true,
    });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'br1', action: 'provider_directory.pharmacy_branch.create' }));
  });
});
