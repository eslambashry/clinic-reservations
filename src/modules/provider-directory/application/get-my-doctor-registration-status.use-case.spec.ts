import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetMyDoctorRegistrationStatusUseCase } from './get-my-doctor-registration-status.use-case';

describe('GetMyDoctorRegistrationStatusUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-id', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

  function setup() {
    const prisma = {} as any;
    const doctors = { findByUserId: jest.fn() };
    const useCase = new GetMyDoctorRegistrationStatusUseCase(prisma, doctors as any);
    return { prisma, doctors, useCase };
  }

  it('throws NotFoundError when the caller never self-registered as a doctor', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the caller\'s own doctor id and status while still PENDING — never 404s a self-registered applicant', async () => {
    const { prisma, doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', status: 'PENDING' });

    await expect(useCase.execute(actor)).resolves.toEqual({ doctorId: 'doctor-1', status: 'PENDING' });
    expect(doctors.findByUserId).toHaveBeenCalledWith(prisma, 'user-1');
  });

  it('returns VERIFIED once an Admin has approved the doctor', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', status: 'VERIFIED' });

    await expect(useCase.execute(actor)).resolves.toEqual({ doctorId: 'doctor-1', status: 'VERIFIED' });
  });
});
