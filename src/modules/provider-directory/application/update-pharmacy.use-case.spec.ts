import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdatePharmacyUseCase } from './update-pharmacy.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('UpdatePharmacyUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'p1', version: 2 }), update: jest.fn() };
    const audit = { record: jest.fn() };
    return { tx, pharmacies, audit, useCase: new UpdatePharmacyUseCase(prisma as any, pharmacies as any, audit as any) };
  }

  it('404s when pharmacy missing', async () => {
    const { useCase, pharmacies } = setup();
    pharmacies.findById.mockResolvedValue(null);
    await expect(useCase.execute('p1', {} as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(pharmacies.update).not.toHaveBeenCalled();
  });

  it('updates with version and audits', async () => {
    const { tx, useCase, pharmacies, audit } = setup();
    const input = { brandName: 'X' } as any;
    await useCase.execute('p1', input, actor);
    expect(pharmacies.update).toHaveBeenCalledWith(tx, 'p1', 2, input);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'p1', action: 'provider_directory.pharmacy.update' }));
  });
});
