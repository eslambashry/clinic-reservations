import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetClinicBranchUseCase } from './get-clinic-branch.use-case';

const branch = (over: any = {}, clinicOver: any = {}) => ({
  id: 'b1', status: 'VERIFIED',
  clinic: { status: 'VERIFIED', deleted_at: null, ...clinicOver },
  ...over,
});

describe('GetClinicBranchUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const branches = { findByIdWithRelations: jest.fn().mockResolvedValue(branch()) };
    return { prisma, branches, useCase: new GetClinicBranchUseCase(prisma, branches as any) };
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

  it('404s for verified branch of non-visible clinic when non-admin', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(branch({}, { status: 'SUSPENDED' }));
    await expect(useCase.execute('b1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns a visible branch to non-admin', async () => {
    const { useCase } = setup();
    await expect(useCase.execute('b1', 'PATIENT')).resolves.toMatchObject({ id: 'b1' });
  });

  it('admin bypasses visibility', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(branch({ status: 'PENDING' }, { deleted_at: new Date() }));
    await expect(useCase.execute('b1', 'ADMIN')).resolves.toMatchObject({ id: 'b1' });
  });
});
