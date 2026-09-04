import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

describe('ResolveDoctorScopeUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

  function affiliationRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'aff-1',
      status: 'ACTIVE',
      consult_fee: { toFixed: (n: number) => (250).toFixed(n) },
      currency: 'EGP',
      clinic_branch: {
        id: 'branch-1',
        status: 'VERIFIED',
        phone: '+201000000000',
        iana_timezone: 'Africa/Cairo',
        clinic: { id: 'clinic-1', brand_name: 'Nile Clinic', status: 'VERIFIED' },
        address: { id: 'address-1', line1: '12 Tahrir St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' },
      },
      ...overrides,
    };
  }

  function setup() {
    const prisma = {} as any;
    const doctors = { findByUserId: jest.fn() };
    const affiliations = { findByDoctorId: jest.fn() };
    const useCase = new ResolveDoctorScopeUseCase(prisma, doctors as any, affiliations as any);
    return { doctors, affiliations, useCase };
  }

  it('404s when the caller has no doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the doctor row is soft-deleted', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', deleted_at: new Date() });

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolves the doctor from the JWT subject, never from a client-supplied id', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', deleted_at: null });
    affiliations.findByDoctorId.mockResolvedValue([affiliationRow()]);

    const scope = await useCase.execute(actor);

    expect(doctors.findByUserId).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(scope.doctorId).toBe('doctor-1');
    expect(scope.affiliationIds).toEqual(['aff-1']);
    expect(scope.clinicBranchIds).toEqual(['branch-1']);
    expect(scope.affiliations[0]).toMatchObject({
      affiliationId: 'aff-1',
      clinicId: 'clinic-1',
      clinicName: 'Nile Clinic',
      clinicBranchId: 'branch-1',
      ianaTimezone: 'Africa/Cairo',
      consultFee: '250.00',
    });
  });

  it('keeps PAUSED affiliations in scope — pausing is not a loss of ownership', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', deleted_at: null });
    affiliations.findByDoctorId.mockResolvedValue([affiliationRow({ status: 'PAUSED' })]);

    const scope = await useCase.execute(actor);

    expect(affiliations.findByDoctorId).toHaveBeenCalledWith(expect.anything(), 'doctor-1', false);
    expect(scope.affiliationIds).toEqual(['aff-1']);
    expect(scope.affiliations[0].affiliationStatus).toBe('PAUSED');
  });

  it('returns an empty scope for a doctor with no affiliations rather than throwing', async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', deleted_at: null });
    affiliations.findByDoctorId.mockResolvedValue([]);

    const scope = await useCase.execute(actor);

    expect(scope).toMatchObject({ doctorId: 'doctor-1', affiliationIds: [], clinicBranchIds: [] });
  });
});
