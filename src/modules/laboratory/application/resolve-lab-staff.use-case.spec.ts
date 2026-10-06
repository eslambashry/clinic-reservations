import { ResolveLabStaffUseCase } from './resolve-lab-staff.use-case';

function setup() {
  const laboratories = { findById: jest.fn().mockResolvedValue({ id: 'lab-1', deleted_at: null }) };
  const branches = { findByLaboratoryId: jest.fn() };
  const listStaff = { execute: jest.fn() };
  const useCase = new ResolveLabStaffUseCase(laboratories as any, branches as any, listStaff as any);
  return { laboratories, branches, listStaff, useCase };
}

describe('ResolveLabStaffUseCase', () => {
  const db = { db: true } as any;

  describe('requireLaboratoryBranches', () => {
    it('returns the laboratory branches', async () => {
      const s = setup();
      s.branches.findByLaboratoryId.mockResolvedValue([{ id: 'b-1' }]);
      await expect(s.useCase.requireLaboratoryBranches(db, 'lab-1')).resolves.toEqual([{ id: 'b-1' }]);
      expect(s.branches.findByLaboratoryId).toHaveBeenCalledWith(db, 'lab-1');
    });

    it('404s a missing laboratory', async () => {
      const s = setup();
      s.laboratories.findById.mockResolvedValue(null);
      await expect(s.useCase.requireLaboratoryBranches(db, 'lab-1')).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('404s a soft-deleted laboratory', async () => {
      const s = setup();
      s.laboratories.findById.mockResolvedValue({ deleted_at: new Date() });
      await expect(s.useCase.requireLaboratoryBranches(db, 'lab-1')).rejects.toMatchObject({ httpStatus: 404 });
    });
  });

  describe('findActive', () => {
    it('returns the first branch that has an active staff member', async () => {
      const s = setup();
      s.branches.findByLaboratoryId.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }]);
      s.listStaff.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ roleMembershipId: 'rm-1' }]);

      const result = await s.useCase.findActive(db, 'lab-1');

      expect(result).toEqual({ staff: { roleMembershipId: 'rm-1' }, labBranchId: 'b-2' });
      expect(s.listStaff.execute).toHaveBeenNthCalledWith(
        2,
        { roleCode: 'LAB_STAFF', contextType: 'LAB_STAFF', contextId: 'b-2' },
        db,
      );
    });

    it('returns null when no branch has active staff', async () => {
      const s = setup();
      s.branches.findByLaboratoryId.mockResolvedValue([{ id: 'b-1' }]);
      s.listStaff.execute.mockResolvedValue([]);
      await expect(s.useCase.findActive(db, 'lab-1')).resolves.toBeNull();
    });
  });
});
