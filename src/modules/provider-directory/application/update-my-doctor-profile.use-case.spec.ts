import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateMyDoctorProfileUseCase } from './update-my-doctor-profile.use-case';

describe('UpdateMyDoctorProfileUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const profile = { id: 'doctor-1', displayName: 'Amr Adel' } as any;

  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findByUserId: jest.fn(), update: jest.fn() };
    const getMyDoctorProfile = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new UpdateMyDoctorProfileUseCase(prisma as any, doctors as any, getMyDoctorProfile as any, audit as any);
    return { tx, doctors, getMyDoctorProfile, audit, useCase };
  }

  it('404s when the caller has no doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute(actor, { bio: 'New bio' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates only bio/degree/experienceYears and re-reads the fresh profile', async () => {
    const { tx, doctors, getMyDoctorProfile, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', version: 3 });
    getMyDoctorProfile.execute.mockResolvedValue(profile);

    const result = await useCase.execute(actor, { bio: 'New bio', degree: 'MD', experienceYears: 12 });

    expect(doctors.update).toHaveBeenCalledWith(tx, 'doctor-1', 3, { bio: 'New bio', degree: 'MD', experienceYears: 12 });
    expect(getMyDoctorProfile.execute).toHaveBeenCalledWith(actor);
    expect(result).toBe(profile);
  });

  it('writes an audit row in the same transaction as the update (File 12 Part 49.1)', async () => {
    const { tx, doctors, getMyDoctorProfile, audit, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', version: 3 });
    getMyDoctorProfile.execute.mockResolvedValue(profile);

    await useCase.execute(actor, { bio: 'New bio' });

    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'user-1',
      actorRoleMembershipId: 'membership-1',
      action: 'provider_directory.doctor.update_self',
      resourceType: 'doctor',
      resourceId: 'doctor-1',
    });
  });

  it('skips the write entirely when no field is given', async () => {
    const { doctors, getMyDoctorProfile, audit, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', version: 3 });
    getMyDoctorProfile.execute.mockResolvedValue(profile);

    await useCase.execute(actor, {});

    expect(doctors.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
