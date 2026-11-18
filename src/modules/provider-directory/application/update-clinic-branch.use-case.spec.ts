import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateClinicBranchUseCase } from './update-clinic-branch.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;

describe('UpdateClinicBranchUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const branches = {
      findByIdWithRelations: jest.fn().mockResolvedValue({ id: 'br1', version: 2, address_id: 'ad1', address: { version: 5 } }),
      update: jest.fn(),
    };
    const addresses = { update: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new UpdateClinicBranchUseCase(prisma as any, branches as any, addresses as any, audit as any);
    return { tx, branches, addresses, audit, useCase };
  }

  it('404s when branch missing', async () => {
    const { useCase, branches } = setup();
    branches.findByIdWithRelations.mockResolvedValue(null);
    await expect(useCase.execute('br1', { phone: '1' } as any, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(branches.update).not.toHaveBeenCalled();
  });

  it('updates branch and address with their own versions', async () => {
    const { tx, useCase, branches, addresses, audit } = setup();
    const input = { phone: '1', address: { city: 'Giza' } } as any;
    await useCase.execute('br1', input, actor);
    expect(branches.update).toHaveBeenCalledWith(tx, 'br1', 2, input);
    expect(addresses.update).toHaveBeenCalledWith(tx, 'ad1', 5, { city: 'Giza' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'br1', action: 'provider_directory.clinic_branch.update' }));
  });

  it('skips address update when no address supplied', async () => {
    const { useCase, addresses, branches } = setup();
    await useCase.execute('br1', { phone: '1' } as any, actor);
    expect(branches.update).toHaveBeenCalled();
    expect(addresses.update).not.toHaveBeenCalled();
  });
});
