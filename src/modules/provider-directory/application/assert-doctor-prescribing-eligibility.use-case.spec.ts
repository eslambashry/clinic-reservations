import { AssertDoctorPrescribingEligibilityUseCase } from './assert-doctor-prescribing-eligibility.use-case';
import { DoctorRepository } from '../infrastructure/doctor.repository';

describe('AssertDoctorPrescribingEligibilityUseCase', () => {
  it('locks the Doctor row before reading current status and retains the lock in the caller transaction', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async (..._args: unknown[]) => { calls.push('lock'); return []; }),
      doctor: { findUnique: jest.fn(async () => { calls.push('read'); return { status: 'VERIFIED', deleted_at: null }; }) },
    };
    const useCase = new AssertDoctorPrescribingEligibilityUseCase(new DoctorRepository());
    await useCase.execute(tx as any, 'doctor-id');
    expect(calls).toEqual(['lock', 'read']);
    expect((tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toMatch(/FROM doctors WHERE id = .*::uuid FOR UPDATE/);
    expect(tx.doctor.findUnique).toHaveBeenCalledWith({ where: { id: 'doctor-id' } });
  });

  it.each([null, { status: 'VERIFIED', deleted_at: new Date() }])('hides missing or deleted doctor %p', async (doctor) => {
    const doctors = { lockForClinicalWrite: jest.fn(), findById: jest.fn().mockResolvedValue(doctor) };
    await expect(new AssertDoctorPrescribingEligibilityUseCase(doctors as any).execute({} as any, 'doctor-id'))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
