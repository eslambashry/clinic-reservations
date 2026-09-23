import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AssertPatientInDoctorScopeUseCase } from './assert-patient-in-doctor-scope.use-case';

describe('AssertPatientInDoctorScopeUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const appointments = { existsForPatientAndAffiliations: jest.fn() };
    const useCase = new AssertPatientInDoctorScopeUseCase(prisma, appointments as any);
    return { prisma, appointments, useCase };
  }

  it('resolves without throwing when the patient has an appointment under one of the affiliations', async () => {
    const { appointments, useCase } = setup();
    appointments.existsForPatientAndAffiliations.mockResolvedValue(true);

    await expect(useCase.execute('patient-1', ['aff-1', 'aff-2'])).resolves.toBeUndefined();
    expect(appointments.existsForPatientAndAffiliations).toHaveBeenCalledWith(expect.anything(), 'patient-1', ['aff-1', 'aff-2']);
  });

  it('404s (hiding existence) when the patient has never had an appointment under any of the affiliations', async () => {
    const { appointments, useCase } = setup();
    appointments.existsForPatientAndAffiliations.mockResolvedValue(false);

    await expect(useCase.execute('patient-1', ['aff-1'])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s without a repository round trip when the caller has no affiliations at all', async () => {
    const { appointments, useCase } = setup();
    appointments.existsForPatientAndAffiliations.mockResolvedValue(false);

    await expect(useCase.execute('patient-1', [])).rejects.toBeInstanceOf(NotFoundError);
  });
});
