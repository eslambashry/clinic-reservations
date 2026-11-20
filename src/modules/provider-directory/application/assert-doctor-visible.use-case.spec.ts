import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AssertDoctorVisibleUseCase } from './assert-doctor-visible.use-case';

describe('AssertDoctorVisibleUseCase', () => {
  function setup(doctor: unknown) {
    const doctors = { findById: jest.fn().mockResolvedValue(doctor) };
    return { doctors, useCase: new AssertDoctorVisibleUseCase({} as any, doctors as any) };
  }

  it('passes for a VERIFIED, not-deleted doctor', async () => {
    const { useCase } = setup({ status: 'VERIFIED', deleted_at: null });
    await expect(useCase.execute('d-1', undefined)).resolves.toBeUndefined();
  });

  it.each(['PENDING', 'REJECTED', 'SUSPENDED'])('404s for a %s doctor', async (status) => {
    const { useCase } = setup({ status, deleted_at: null });
    await expect(useCase.execute('d-1', 'PATIENT')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s for a soft-deleted or missing doctor', async () => {
    await expect(setup({ status: 'VERIFIED', deleted_at: new Date() }).useCase.execute('d-1', undefined)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup(null).useCase.execute('d-1', undefined)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets an Admin through without looking the doctor up', async () => {
    const { doctors, useCase } = setup(null);
    await expect(useCase.execute('d-1', 'ADMIN')).resolves.toBeUndefined();
    expect(doctors.findById).not.toHaveBeenCalled();
  });
});
