import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RejectDoctorUseCase } from './reject-doctor.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('RejectDoctorUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findById: jest.fn().mockResolvedValue({ id: 'd1', version: 2, status: 'PENDING' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new RejectDoctorUseCase(prisma as any, doctors as any, audit as any, outbox as any);
    return { tx, doctors, audit, outbox, useCase };
  }

  it('404s when doctor missing', async () => {
    const { useCase, doctors } = setup();
    doctors.findById.mockResolvedValue(null);
    await expect(useCase.execute('d1', 'BAD_DOCS', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when not pending', async () => {
    const { useCase, doctors, outbox } = setup();
    doctors.findById.mockResolvedValue({ id: 'd1', version: 2, status: 'ACTIVE' });
    await expect(useCase.execute('d1', 'BAD_DOCS', actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(doctors.setStatus).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('sets REJECTED, audits and emits', async () => {
    const { tx, useCase, doctors, audit, outbox } = setup();
    await useCase.execute('d1', 'BAD_DOCS', actor);
    expect(doctors.setStatus).toHaveBeenCalledWith(tx, 'd1', 2, 'REJECTED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'BAD_DOCS', action: 'provider_directory.doctor.reject' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderApplicationRejected', { providerType: 'DOCTOR', providerId: 'd1', reasonCode: 'BAD_DOCS' });
  });
});
