import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetMyDoctorProfileUseCase } from './get-my-doctor-profile.use-case';

describe('GetMyDoctorProfileUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

  function setup() {
    const doctors = { findByIdWithUser: jest.fn() };
    const doctorScope = { execute: jest.fn().mockResolvedValue({ doctorId: 'doctor-1', affiliations: [], affiliationIds: [], clinicBranchIds: [] }) };
    const useCase = new GetMyDoctorProfileUseCase({} as any, doctors as any, doctorScope as any);
    return { doctors, doctorScope, useCase };
  }

  it('404s when the resolved doctor row is missing', async () => {
    const { doctors, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue(null);

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the caller's own doctor profile, including licenseNumber", async () => {
    const { doctors, doctorScope, useCase } = setup();
    doctors.findByIdWithUser.mockResolvedValue({
      id: 'doctor-1',
      license_number: 'LIC-123',
      bio: 'Cardiologist',
      degree: 'MBBCh',
      experience_years: 10,
      photo_url: null,
      status: 'VERIFIED',
      specialty: { name_en: 'Cardiology', code: 'CARDIOLOGY' },
      user: { first_name: 'Amr', last_name: 'Adel', email: 'amr@example.com', phone: '+201001234567' },
    });

    const result = await useCase.execute(actor);

    expect(doctorScope.execute).toHaveBeenCalledWith(actor);
    expect(doctors.findByIdWithUser).toHaveBeenCalledWith({}, 'doctor-1');
    expect(result).toEqual({
      id: 'doctor-1',
      displayName: 'Amr Adel',
      email: 'amr@example.com',
      phone: '+201001234567',
      specialty: 'Cardiology',
      specialtyKey: 'CARDIOLOGY',
      licenseNumber: 'LIC-123',
      bio: 'Cardiologist',
      degree: 'MBBCh',
      experienceYears: 10,
      photoUrl: null,
      isVerified: true,
    });
  });

  it("resolves a CLINIC_STAFF caller's provisioning doctor via ResolveDoctorScopeUseCase", async () => {
    const staffActor = { sub: 'staff-1', roleMembershipId: 'membership-2', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', permissions: [] } as any;
    const { doctors, doctorScope, useCase } = setup();
    doctorScope.execute.mockResolvedValue({ doctorId: 'doctor-9', affiliations: [], affiliationIds: [], clinicBranchIds: [] });
    doctors.findByIdWithUser.mockResolvedValue({
      id: 'doctor-9',
      license_number: 'LIC-999',
      bio: null,
      degree: null,
      experience_years: null,
      photo_url: null,
      status: 'VERIFIED',
      specialty: { name_en: 'Dermatology', code: 'DERMATOLOGY' },
      user: { first_name: 'Mahmoud', last_name: 'Taha', email: null, phone: '+201000000000' },
    });

    const result = await useCase.execute(staffActor);

    expect(doctorScope.execute).toHaveBeenCalledWith(staffActor);
    expect(doctors.findByIdWithUser).toHaveBeenCalledWith({}, 'doctor-9');
    expect(result.id).toBe('doctor-9');
  });
});
