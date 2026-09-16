import { ListActiveAdminUserIdsUseCase } from './list-active-admin-user-ids.use-case';

describe('ListActiveAdminUserIdsUseCase', () => {
  function setup() {
    const prisma = {};
    const roleMemberships = { listActiveByRoleContextType: jest.fn() };
    const useCase = new ListActiveAdminUserIdsUseCase(prisma as any, roleMemberships as any);
    return { prisma, roleMemberships, useCase };
  }

  it('resolves every ACTIVE ADMIN membership into a flat user id list', async () => {
    const { prisma, roleMemberships, useCase } = setup();
    roleMemberships.listActiveByRoleContextType.mockResolvedValue([
      { id: 'membership-1', user_id: 'admin-1' },
      { id: 'membership-2', user_id: 'admin-2' },
    ]);

    const result = await useCase.execute();

    expect(roleMemberships.listActiveByRoleContextType).toHaveBeenCalledWith(prisma, {
      roleCode: 'ADMIN',
      contextType: 'ADMIN',
    });
    expect(result).toEqual(['admin-1', 'admin-2']);
  });

  it('returns an empty array when there are no active admins', async () => {
    const { roleMemberships, useCase } = setup();
    roleMemberships.listActiveByRoleContextType.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
