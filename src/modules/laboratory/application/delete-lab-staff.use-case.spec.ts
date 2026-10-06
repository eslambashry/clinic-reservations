import { DeleteLabStaffUseCase } from './delete-lab-staff.use-case';

function setup() {
  const tx = { tx: true } as any;
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const laboratories = { findById: jest.fn().mockResolvedValue({ id: 'lab-1', deleted_at: null }) };
  const staffAssignments = { findBranchIdForLaboratory: jest.fn().mockResolvedValue('b-1') };
  const revoke = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const useCase = new DeleteLabStaffUseCase(prisma as any, laboratories as any, staffAssignments as any, revoke as any, audit as any);
  return { tx, laboratories, staffAssignments, revoke, audit, useCase };
}

describe('DeleteLabStaffUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin' } as any;

  it('revokes the membership and audits', async () => {
    const s = setup();
    await s.useCase.execute('lab-1', 'rm-1', actor);

    expect(s.revoke.execute).toHaveBeenCalledWith(s.tx, {
      roleMembershipId: 'rm-1',
      roleCode: 'LAB_STAFF',
      contextType: 'LAB_STAFF',
      contextId: 'b-1',
    });
    expect(s.audit.record).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({ action: 'laboratory.lab_staff.revoke', resourceId: 'rm-1' }),
    );
  });

  it('404s a missing laboratory', async () => {
    const s = setup();
    s.laboratories.findById.mockResolvedValue(null);
    await expect(s.useCase.execute('lab-1', 'rm-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a soft-deleted laboratory', async () => {
    const s = setup();
    s.laboratories.findById.mockResolvedValue({ deleted_at: new Date() });
    await expect(s.useCase.execute('lab-1', 'rm-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a staff id outside the laboratory', async () => {
    const s = setup();
    s.staffAssignments.findBranchIdForLaboratory.mockResolvedValue(null);
    await expect(s.useCase.execute('lab-1', 'rm-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(s.revoke.execute).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});
