import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetDoctorUseCase } from './get-doctor.use-case';

function affiliation(overrides: Partial<any> = {}) {
  return {
    id: 'aff-1',
    status: 'ACTIVE',
    clinic_branch: { status: 'VERIFIED', clinic: { status: 'VERIFIED', deleted_at: null } },
    ...overrides,
  };
}

describe('GetDoctorUseCase', () => {
  function setup() {
    const prisma = {};
    const doctors = { findByIdWithUser: jest.fn() };
    const affiliations = { findByDoctorId: jest.fn() };
    const useCase = new GetDoctorUseCase(prisma as any, doctors as any, affiliations as any);
    return { doctors, affiliations, useCase };
  }

  it('404s an anonymous caller for a PENDING doctor (never reveal existence, File 11 07.2)', async () => {
    const { doctors, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue({ id: 'd1', status: 'PENDING', deleted_at: null });

    await expect(useCase.execute('d1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s a non-Admin authenticated caller for a PENDING doctor', async () => {
    const { doctors, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue({ id: 'd1', status: 'PENDING', deleted_at: null });

    await expect(useCase.execute('d1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets an Admin caller see a PENDING doctor, including non-ACTIVE affiliations', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue({ id: 'd1', status: 'PENDING', deleted_at: null });
    const paused = affiliation({ id: 'aff-paused', status: 'PAUSED' });
    affiliations.findByDoctorId.mockResolvedValue([paused]);

    const result = await useCase.execute('d1', 'ADMIN');

    expect(result.doctor.status).toBe('PENDING');
    expect(result.affiliations).toEqual([paused]);
  });

  it('returns a VERIFIED doctor to an anonymous caller, filtered to visible affiliations only', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue({ id: 'd1', status: 'VERIFIED', deleted_at: null });
    const visible = affiliation({ id: 'aff-visible' });
    const pausedAtSuspendedBranch = affiliation({
      id: 'aff-hidden',
      status: 'ACTIVE',
      clinic_branch: { status: 'SUSPENDED', clinic: { status: 'VERIFIED', deleted_at: null } },
    });
    affiliations.findByDoctorId.mockResolvedValue([visible, pausedAtSuspendedBranch]);

    const result = await useCase.execute('d1', undefined);

    expect(result.affiliations).toEqual([visible]);
  });
});
