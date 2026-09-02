import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetMyDoctorProfileUseCase } from './get-my-doctor-profile.use-case';

describe('GetMyDoctorProfileUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

  function setup() {
    const doctors = { findByUserIdWithUser: jest.fn() };
    const useCase = new GetMyDoctorProfileUseCase({} as any, doctors as any);
    return { doctors, useCase };
  }

  it('404s when the caller has no doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserIdWithUser.mockResolvedValue(null);

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the caller's own doctor profile, including licenseNumber", async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserIdWithUser.mockResolvedValue({
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
});
