import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetPharmacyStaffUseCase } from './get-pharmacy-staff.use-case';

const member = { roleMembershipId: 'rm1', phone: '+20', displayName: 'S', title: null, subtitle: null, status: 'ACTIVE', createdAt: new Date('2026-01-01T00:00:00Z') };

describe('GetPharmacyStaffUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'ph1', deleted_at: null }) };
    const branches = { findByPharmacyId: jest.fn().mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]) };
    const listStaff = { execute: jest.fn().mockResolvedValue([]) };
    const useCase = new GetPharmacyStaffUseCase(prisma, pharmacies as any, branches as any, listStaff as any);
    return { pharmacies, branches, listStaff, useCase };
  }

  it.each([[null], [{ id: 'ph1', deleted_at: new Date() }]])('404s for missing or deleted pharmacy', async (p) => {
    const { useCase, pharmacies } = setup();
    pharmacies.findById.mockResolvedValue(p);
    await expect(useCase.execute('ph1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns null when no branch has staff', async () => {
    const { useCase, listStaff } = setup();
    await expect(useCase.execute('ph1')).resolves.toBeNull();
    expect(listStaff.execute).toHaveBeenCalledTimes(2);
  });

  it('returns null with no branches', async () => {
    const { useCase, branches } = setup();
    branches.findByPharmacyId.mockResolvedValue([]);
    await expect(useCase.execute('ph1')).resolves.toBeNull();
  });

  it('returns the first branch staff found and stops', async () => {
    const { useCase, listStaff } = setup();
    listStaff.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([member]);
    const res = await useCase.execute('ph1');
    expect(res).toMatchObject({ id: 'rm1', pharmacy_branch_id: 'b2' });
  });
});
