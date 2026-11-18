import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { VerifyPharmacyUseCase } from './verify-pharmacy.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('VerifyPharmacyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'p1', version: 3, status: 'PENDING' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new VerifyPharmacyUseCase(prisma as any, pharmacies as any, audit as any, outbox as any);
    return { tx, pharmacies, audit, outbox, useCase };
  }

  it('404s when pharmacy missing', async () => {
    const { useCase, pharmacies, outbox } = setup();
    pharmacies.findById.mockResolvedValue(null);
    await expect(useCase.execute('p1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('verifies, audits previous status and emits', async () => {
    const { tx, useCase, pharmacies, audit, outbox } = setup();
    await useCase.execute('p1', actor);
    expect(pharmacies.setStatus).toHaveBeenCalledWith(tx, 'p1', 3, 'VERIFIED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_status:PENDING' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderVerified', { providerType: 'PHARMACY', providerId: 'p1' });
  });
});
