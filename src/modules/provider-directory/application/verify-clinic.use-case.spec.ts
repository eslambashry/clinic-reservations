import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { VerifyClinicUseCase } from './verify-clinic.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('VerifyClinicUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const clinics = { findById: jest.fn().mockResolvedValue({ id: 'c1', version: 3, status: 'PENDING' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new VerifyClinicUseCase(prisma as any, clinics as any, audit as any, outbox as any);
    return { tx, clinics, audit, outbox, useCase };
  }

  it('404s when clinic missing', async () => {
    const { useCase, clinics, outbox } = setup();
    clinics.findById.mockResolvedValue(null);
    await expect(useCase.execute('c1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('verifies, audits previous status and emits', async () => {
    const { tx, useCase, clinics, audit, outbox } = setup();
    await useCase.execute('c1', actor);
    expect(clinics.setStatus).toHaveBeenCalledWith(tx, 'c1', 3, 'VERIFIED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_status:PENDING' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderVerified', { providerType: 'CLINIC', providerId: 'c1' });
  });
});
