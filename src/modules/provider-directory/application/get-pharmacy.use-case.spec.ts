import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetPharmacyUseCase } from './get-pharmacy.use-case';

const pharmacy = (over: any = {}) => ({
  id: 'p1', status: 'VERIFIED', deleted_at: null,
  branches: [{ id: 'b1', status: 'VERIFIED' }, { id: 'b2', status: 'PENDING' }],
  ...over,
});

describe('GetPharmacyUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const pharmacies = { findByIdWithBranches: jest.fn().mockResolvedValue(pharmacy()) };
    return { prisma, pharmacies, useCase: new GetPharmacyUseCase(prisma, pharmacies as any) };
  }

  it('404s when not found (even for admin)', async () => {
    const { useCase, pharmacies } = setup();
    pharmacies.findByIdWithBranches.mockResolvedValue(null);
    await expect(useCase.execute('p1', 'ADMIN')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for non-visible pharmacy when caller is not admin', async () => {
    const { useCase, pharmacies } = setup();
    pharmacies.findByIdWithBranches.mockResolvedValue(pharmacy({ status: 'PENDING' }));
    await expect(useCase.execute('p1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for soft-deleted pharmacy when caller context is undefined', async () => {
    const { useCase, pharmacies } = setup();
    pharmacies.findByIdWithBranches.mockResolvedValue(pharmacy({ deleted_at: new Date() }));
    await expect(useCase.execute('p1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('admin sees everything including unverified branches', async () => {
    const { useCase, pharmacies } = setup();
    pharmacies.findByIdWithBranches.mockResolvedValue(pharmacy({ status: 'SUSPENDED' }));
    const res = await useCase.execute('p1', 'ADMIN');
    expect(res.branches).toHaveLength(2);
  });

  it('non-admin sees only verified branches of a verified pharmacy', async () => {
    const { useCase } = setup();
    const res = await useCase.execute('p1', 'PATIENT');
    expect(res.branches.map((b: any) => b.id)).toEqual(['b1']);
  });
});
