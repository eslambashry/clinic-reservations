import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetPharmacyBranchUseCase } from './get-pharmacy-branch.use-case';

const branch = (over: any = {}, pharmacyOver: any = {}) => ({
  id: 'b1', status: 'VERIFIED',
  pharmacy: { status: 'VERIFIED', deleted_at: null, ...pharmacyOver },
  ...over,
});

describe('GetPharmacyBranchUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const branches = { findByIdWithRelations: jest.fn().mockResolvedValue(branch()) };
    return { prisma, branches, useCase: new GetPharmacyBranchUseCase(prisma, branches as any) };
  }

  it('404s when branch missing (even for admin)', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(null);
    await expect(useCase.execute('b1', 'ADMIN')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for unverified branch when non-admin', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(branch({ status: 'PENDING' }));
    await expect(useCase.execute('b1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for verified branch of non-visible pharmacy when non-admin', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(branch({}, { deleted_at: new Date() }));
    await expect(useCase.execute('b1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns a visible branch to non-admin', async () => {
    const { useCase } = setup();
    await expect(useCase.execute('b1', 'PATIENT')).resolves.toMatchObject({ id: 'b1' });
  });

  it('admin bypasses visibility', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(branch({ status: 'PENDING' }, { status: 'SUSPENDED' }));
    await expect(useCase.execute('b1', 'ADMIN')).resolves.toMatchObject({ id: 'b1' });
  });
});
