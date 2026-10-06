import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { SuspendPharmacyUseCase } from './suspend-pharmacy.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('SuspendPharmacyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'p1', version: 3, status: 'VERIFIED' }), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, pharmacies, audit, useCase: new SuspendPharmacyUseCase(prisma as any, pharmacies as any, audit as any) };
  }

  it('404s when pharmacy missing', async () => {
    const { useCase, pharmacies, audit } = setup();
    pharmacies.findById.mockResolvedValue(null);
    await expect(useCase.execute('p1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('suspends and audits previous status', async () => {
    const { tx, useCase, pharmacies, audit } = setup();
    await useCase.execute('p1', actor);
    expect(pharmacies.setStatus).toHaveBeenCalledWith(tx, 'p1', 3, 'SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ reasonCode: 'previous_status:VERIFIED' }));
  });
});
