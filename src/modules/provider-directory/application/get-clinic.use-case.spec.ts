import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetClinicUseCase } from './get-clinic.use-case';

const clinic = (over: any = {}) => ({
  id: 'c1', status: 'VERIFIED', deleted_at: null,
  branches: [{ id: 'b1', status: 'VERIFIED' }, { id: 'b2', status: 'PENDING' }],
  ...over,
});

describe('GetClinicUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const clinics = { findByIdWithBranches: jest.fn().mockResolvedValue(clinic()) };
    return { prisma, clinics, useCase: new GetClinicUseCase(prisma, clinics as any) };
  }

  it('404s when not found (even for admin)', async () => {
    const { useCase, clinics } = setup();
    clinics.findByIdWithBranches.mockResolvedValue(null);
    await expect(useCase.execute('c1', 'ADMIN')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for non-visible clinic when caller is not admin', async () => {
    const { useCase, clinics } = setup();
    clinics.findByIdWithBranches.mockResolvedValue(clinic({ status: 'PENDING' }));
    await expect(useCase.execute('c1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for soft-deleted clinic when caller context is undefined', async () => {
    const { useCase, clinics } = setup();
    clinics.findByIdWithBranches.mockResolvedValue(clinic({ deleted_at: new Date() }));
    await expect(useCase.execute('c1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('admin sees everything including unverified branches', async () => {
    const { useCase, clinics } = setup();
    clinics.findByIdWithBranches.mockResolvedValue(clinic({ status: 'SUSPENDED' }));
    const res = await useCase.execute('c1', 'ADMIN');
    expect(res.branches).toHaveLength(2);
  });

  it('non-admin sees only verified branches of a verified clinic', async () => {
    const { useCase } = setup();
    const res = await useCase.execute('c1', 'PATIENT');
    expect(res.branches.map((b: any) => b.id)).toEqual(['b1']);
  });
});
