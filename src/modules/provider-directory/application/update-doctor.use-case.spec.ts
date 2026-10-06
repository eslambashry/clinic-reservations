import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateDoctorUseCase } from './update-doctor.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('UpdateDoctorUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findById: jest.fn().mockResolvedValue({ id: 'd1', version: 4 }), update: jest.fn() };
    const specialties = { findByCode: jest.fn().mockResolvedValue({ code: 'CARDIO' }) };
    const audit = { record: jest.fn() };
    const useCase = new UpdateDoctorUseCase(prisma as any, doctors as any, specialties as any, audit as any);
    return { tx, doctors, specialties, audit, useCase };
  }

  it('404s when doctor missing', async () => {
    const { useCase, doctors } = setup();
    doctors.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', {} as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(doctors.update).not.toHaveBeenCalled();
  });

  it('404s when specialty code unknown', async () => {
    const { useCase, specialties, doctors } = setup();
    specialties.findByCode.mockResolvedValue(null);
    await expect(useCase.execute('d1', { specialtyCode: 'NOPE' } as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(doctors.update).not.toHaveBeenCalled();
  });

  it('validates specialty, updates with version, audits', async () => {
    const { tx, useCase, doctors, specialties, audit } = setup();
    const input = { specialtyCode: 'CARDIO' } as any;
    await useCase.execute('d1', input, actor);
    expect(specialties.findByCode).toHaveBeenCalledWith(tx, 'CARDIO');
    expect(doctors.update).toHaveBeenCalledWith(tx, 'd1', 4, input);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'd1', action: 'provider_directory.doctor.update' }));
  });

  it('skips specialty lookup when none supplied', async () => {
    const { useCase, specialties, doctors } = setup();
    await useCase.execute('d1', { bio: 'x' } as any, actor);
    expect(specialties.findByCode).not.toHaveBeenCalled();
    expect(doctors.update).toHaveBeenCalled();
  });
});
