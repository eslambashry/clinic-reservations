import { CreatePharmacyUseCase } from './create-pharmacy.use-case';

describe('CreatePharmacyUseCase', () => {
  it('creates the pharmacy inside a transaction and audits', async () => {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { create: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const audit = { record: jest.fn() };
    const useCase = new CreatePharmacyUseCase(prisma as any, pharmacies as any, audit as any);
    const input = { legalName: 'L', brandName: 'B' } as any;

    await expect(useCase.execute(input, { sub: 'a1', roleMembershipId: 'rm1' } as any)).resolves.toEqual({ id: 'p1' });

    expect(pharmacies.create).toHaveBeenCalledWith(tx, input);
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'a1', actorRoleMembershipId: 'rm1', action: 'provider_directory.pharmacy.create',
      resourceType: 'pharmacy', resourceId: 'p1',
    });
  });
});
