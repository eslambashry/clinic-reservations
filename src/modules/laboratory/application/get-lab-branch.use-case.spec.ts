import { GetLabBranchUseCase } from './get-lab-branch.use-case';

function setup() {
  const prisma = {} as any;
  const labBranches = { findByIdWithRelations: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const useCase = new GetLabBranchUseCase(prisma, labBranches as any, getActiveRoleMembership as any);
  return { labBranches, getActiveRoleMembership, useCase };
}

describe('GetLabBranchUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', permissions: [] } as any;

  it("returns the caller's own branch, laboratory brand and address only", async () => {
    const { labBranches, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labBranches.findByIdWithRelations.mockResolvedValue({
      id: 'branch-1',
      phone: '+20221230099',
      laboratory: { brand_name: 'Nile Labs' },
      address: { line1: '5 Zamalek Ave', city: 'Cairo' },
    });

    const result = await useCase.execute('branch-1', actor);

    expect(result).toEqual({
      id: 'branch-1',
      phone: '+20221230099',
      laboratory: { brandName: 'Nile Labs' },
      address: { line1: '5 Zamalek Ave', city: 'Cairo' },
    });
  });

  it('403s a LAB_STAFF actor with no active branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('branch-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("403s a request for a branch other than the caller's own", async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });

    await expect(useCase.execute('other-branch', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('404s a branch id that does not exist', async () => {
    const { labBranches, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue({ roleMembershipId: 'm-2', contextId: 'branch-1' });
    labBranches.findByIdWithRelations.mockResolvedValue(null);

    await expect(useCase.execute('branch-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });
});
