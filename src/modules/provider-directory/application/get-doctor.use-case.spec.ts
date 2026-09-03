import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetDoctorUseCase } from './get-doctor.use-case';

function doctor(overrides: Partial<any> = {}) {
  return {
    id: 'd1',
    status: 'VERIFIED',
    deleted_at: null,
    photo_url: null,
    rating_avg: 4.5,
    rating_count: 10,
    bio: null,
    degree: null,
    experience_years: null,
    user: { first_name: 'Mona', last_name: 'Hassan' },
    specialty: { code: 'CARDIOLOGY', name_en: 'Cardiology' },
    ...overrides,
  };
}

function affiliation(overrides: Partial<any> = {}) {
  return {
    id: 'aff-1',
    status: 'ACTIVE',
    clinic_branch_id: 'branch-1',
    consult_fee: { toString: () => '150.00' },
    currency: 'EGP',
    clinic_branch: {
      status: 'VERIFIED',
      iana_timezone: 'Africa/Cairo',
      clinic: { status: 'VERIFIED', deleted_at: null, brand_name: 'Nile Clinic' },
    },
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
    doctors.findByIdWithUser.mockResolvedValue(doctor({ status: 'PENDING' }));

    await expect(useCase.execute('d1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s a non-Admin authenticated caller for a PENDING doctor', async () => {
    const { doctors, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(doctor({ status: 'PENDING' }));

    await expect(useCase.execute('d1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets an Admin caller see a PENDING doctor, including non-ACTIVE affiliations', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(doctor({ status: 'PENDING' }));
    const paused = affiliation({ id: 'aff-paused', status: 'PAUSED' });
    affiliations.findByDoctorId.mockResolvedValue([paused]);

    const result = await useCase.execute('d1', 'ADMIN');

    expect(result.isVerified).toBe(false);
    expect(result.affiliations).toEqual([
      { affiliationId: 'aff-paused', clinicBranchId: 'branch-1', clinicName: 'Nile Clinic', consultationFee: '150.00', currency: 'EGP', ianaTimezone: 'Africa/Cairo' },
    ]);
  });

  it('returns a VERIFIED doctor to an anonymous caller, filtered to visible affiliations only', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(doctor());
    const visible = affiliation({ id: 'aff-visible' });
    const pausedAtSuspendedBranch = affiliation({
      id: 'aff-hidden',
      status: 'ACTIVE',
      clinic_branch: {
        status: 'SUSPENDED',
        iana_timezone: 'Africa/Cairo',
        clinic: { status: 'VERIFIED', deleted_at: null, brand_name: 'Nile Clinic' },
      },
    });
    affiliations.findByDoctorId.mockResolvedValue([visible, pausedAtSuspendedBranch]);

    const result = await useCase.execute('d1', undefined);

    expect(result.name).toBe('Mona Hassan');
    expect(result.affiliations).toHaveLength(1);
    expect(result.affiliations[0].clinicBranchId).toBe('branch-1');
  });

  it('exposes the primary affiliation id at the top level, for the Phase 4 hold contract', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(doctor());
    affiliations.findByDoctorId.mockResolvedValue([affiliation({ id: 'aff-primary' })]);

    const result = await useCase.execute('d1', undefined);

    expect(result.affiliationId).toBe('aff-primary');
  });

  it('exposes bio/degree/experienceYears from the Doctor row (ADR-005 Part 34.2)', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(doctor({ bio: 'Cardiologist.', degree: 'MBBCh, MD', experience_years: 12 }));
    affiliations.findByDoctorId.mockResolvedValue([]);

    const result = await useCase.execute('d1', undefined);

    expect(result.bio).toBe('Cardiologist.');
    expect(result.degree).toBe('MBBCh, MD');
    expect(result.experienceYears).toBe(12);
  });
});
