import { GetActiveRoleMembershipUseCase } from './get-active-role-membership.use-case';

describe('GetActiveRoleMembershipUseCase.executeByRoleMembershipId', () => {
  const prisma: any = {};
  const repo = { findActiveById: jest.fn(), findActiveByUser: jest.fn() };
  const useCase = new GetActiveRoleMembershipUseCase(prisma, repo as any);
  beforeEach(() => jest.resetAllMocks());

  it('returns null when membership missing', async () => {
    repo.findActiveById.mockResolvedValue(null);
    expect(await useCase.executeByRoleMembershipId('m', 'PHARMACY_STAFF')).toBeNull();
  });

  it('returns null on context type mismatch', async () => {
    repo.findActiveById.mockResolvedValue({ id: 'm', context_type: 'PATIENT', context_id: null });
    expect(await useCase.executeByRoleMembershipId('m', 'PHARMACY_STAFF')).toBeNull();
  });

  it('returns the membership when matching', async () => {
    repo.findActiveById.mockResolvedValue({ id: 'm', context_type: 'PHARMACY_STAFF', context_id: 'b' });
    expect(await useCase.executeByRoleMembershipId('m', 'PHARMACY_STAFF')).toEqual({ roleMembershipId: 'm', contextId: 'b' });
    expect(repo.findActiveById).toHaveBeenCalledWith(prisma, 'm');
  });
});
