import { GetActiveRoleMembershipUseCase } from './get-active-role-membership.use-case';

describe('GetActiveRoleMembershipUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const roleMemberships = { findActiveByUser: jest.fn() };
    const useCase = new GetActiveRoleMembershipUseCase(prisma, roleMemberships as any);
    return { prisma, roleMemberships, useCase };
  }

  it('returns null when the user has no active memberships at all', async () => {
    const { roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([]);

    expect(await useCase.execute('user-1', 'PHARMACY_STAFF')).toBeNull();
  });

  it('returns null when no active membership matches the given contextType', async () => {
    const { roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ id: 'membership-1', context_type: 'PATIENT', context_id: null }]);

    expect(await useCase.execute('user-1', 'PHARMACY_STAFF')).toBeNull();
  });

  it('returns the matching membership id and contextId', async () => {
    const { roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([
      { id: 'membership-1', context_type: 'PATIENT', context_id: null },
      { id: 'membership-2', context_type: 'PHARMACY_STAFF', context_id: 'branch-1' },
    ]);

    expect(await useCase.execute('user-1', 'PHARMACY_STAFF')).toEqual({ roleMembershipId: 'membership-2', contextId: 'branch-1' });
  });
});
