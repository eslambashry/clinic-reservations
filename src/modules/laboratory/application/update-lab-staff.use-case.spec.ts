import { UpdateLabStaffUseCase } from './update-lab-staff.use-case';

function setup() {
  const tx = { tx: true } as any;
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const laboratories = { findById: jest.fn().mockResolvedValue({ id: 'lab-1', deleted_at: null }) };
  const staffAssignments = { findBranchIdForLaboratory: jest.fn().mockResolvedValue('b-1') };
  const updateStaffMembership = {
    execute: jest.fn().mockResolvedValue({
      roleMembershipId: 'rm-1',
      phone: '+20100',
      displayName: 'New',
      title: 'T',
      subtitle: null,
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }),
  };
  const audit = { record: jest.fn() };
  const useCase = new UpdateLabStaffUseCase(
    prisma as any,
    laboratories as any,
    staffAssignments as any,
    updateStaffMembership as any,
    audit as any,
  );
  return { tx, laboratories, staffAssignments, updateStaffMembership, audit, useCase };
}

describe('UpdateLabStaffUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin' } as any;

  it('updates the membership, audits and returns the response without a password', async () => {
    const s = setup();
    const result = await s.useCase.execute('lab-1', 'rm-1', { display_name: 'New', status: 'ACTIVE', title: 'T' } as any, actor);

    expect(s.staffAssignments.findBranchIdForLaboratory).toHaveBeenCalledWith(s.tx, {
      roleMembershipId: 'rm-1',
      laboratoryId: 'lab-1',
    });
    expect(s.updateStaffMembership.execute).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({ roleMembershipId: 'rm-1', contextId: 'b-1', roleCode: 'LAB_STAFF', displayName: 'New' }),
    );
    expect(s.audit.record).toHaveBeenCalledWith(s.tx, expect.objectContaining({ action: 'laboratory.lab_staff.update' }));
    expect(result).toMatchObject({ id: 'rm-1', lab_branch_id: 'b-1', display_name: 'New' });
    expect(result).not.toHaveProperty('generated_password');
  });

  it('includes a generated password when the membership update returns one', async () => {
    const s = setup();
    s.updateStaffMembership.execute.mockResolvedValue({
      roleMembershipId: 'rm-1',
      phone: 'p',
      displayName: null,
      title: null,
      subtitle: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      generatedPassword: 'new-pw',
    });
    const result = await s.useCase.execute('lab-1', 'rm-1', {} as any, actor);
    expect(result.generated_password).toBe('new-pw');
    expect(result.display_name).toBe('');
  });

  it('404s a missing laboratory', async () => {
    const s = setup();
    s.laboratories.findById.mockResolvedValue(null);
    await expect(s.useCase.execute('lab-1', 'rm-1', {} as any, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a soft-deleted laboratory', async () => {
    const s = setup();
    s.laboratories.findById.mockResolvedValue({ deleted_at: new Date() });
    await expect(s.useCase.execute('lab-1', 'rm-1', {} as any, actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s a staff id not belonging to the laboratory', async () => {
    const s = setup();
    s.staffAssignments.findBranchIdForLaboratory.mockResolvedValue(null);
    await expect(s.useCase.execute('lab-1', 'rm-1', {} as any, actor)).rejects.toMatchObject({ httpStatus: 404 });
    expect(s.updateStaffMembership.execute).not.toHaveBeenCalled();
  });
});
