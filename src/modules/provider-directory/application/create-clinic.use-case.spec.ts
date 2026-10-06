import { CreateClinicUseCase } from './create-clinic.use-case';

describe('CreateClinicUseCase', () => {
  it('creates the clinic inside a transaction and audits', async () => {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const clinics = { create: jest.fn().mockResolvedValue({ id: 'c1' }) };
    const audit = { record: jest.fn() };
    const useCase = new CreateClinicUseCase(prisma as any, clinics as any, audit as any);
    const input = { legalName: 'L', brandName: 'B' } as any;

    await expect(useCase.execute(input, { sub: 'a1', roleMembershipId: 'rm1' } as any)).resolves.toEqual({ id: 'c1' });

    expect(clinics.create).toHaveBeenCalledWith(tx, input);
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'a1', actorRoleMembershipId: 'rm1', action: 'provider_directory.clinic.create',
      resourceType: 'clinic', resourceId: 'c1',
    });
  });
});
