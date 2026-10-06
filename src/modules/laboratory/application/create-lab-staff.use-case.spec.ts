import { CreateLabStaffUseCase } from './create-lab-staff.use-case';

function setup() {
  const tx = { tx: true } as any;
  const prisma = { $transaction: jest.fn((cb: any, _opts?: any) => cb(tx)) };
  const resolveLabStaff = { requireLaboratoryBranches: jest.fn(), findActive: jest.fn() };
  const staffAssignments = { acquireProvisioningLock: jest.fn(), create: jest.fn() };
  const roleMemberships = { setTitleSubtitle: jest.fn() };
  const provisionStaffUser = {
    execute: jest.fn().mockResolvedValue({
      userId: 'u-1',
      roleMembershipId: 'rm-1',
      phone: '+201000000000',
      displayName: 'Lab Staff',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      generatedPassword: 'pw-123',
    }),
  };
  const audit = { record: jest.fn() };
  const outbox = { emit: jest.fn() };
  const useCase = new CreateLabStaffUseCase(
    prisma as any,
    resolveLabStaff as any,
    staffAssignments as any,
    roleMemberships as any,
    provisionStaffUser as any,
    audit as any,
    outbox as any,
  );
  return { tx, prisma, resolveLabStaff, staffAssignments, roleMemberships, provisionStaffUser, audit, outbox, useCase };
}

describe('CreateLabStaffUseCase', () => {
  const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin' } as any;
  const dto = { phone: '+201000000000', display_name: 'Lab Staff', title: 'Tech', subtitle: 'Night' } as any;

  it('provisions the account on the single branch and returns the one-time password', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([{ id: 'b-1' }]);
    s.resolveLabStaff.findActive.mockResolvedValue(null);

    const result = await s.useCase.execute('lab-1', dto, actor);

    expect(s.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
    expect(s.staffAssignments.acquireProvisioningLock).toHaveBeenCalledWith(s.tx, 'lab-1');
    expect(s.provisionStaffUser.execute).toHaveBeenCalledWith(s.tx, {
      phone: dto.phone,
      displayName: dto.display_name,
      roleCode: 'LAB_STAFF',
      contextType: 'LAB_STAFF',
      contextId: 'b-1',
    });
    expect(s.roleMemberships.setTitleSubtitle).toHaveBeenCalledWith(s.tx, 'rm-1', { title: 'Tech', subtitle: 'Night' });
    expect(s.staffAssignments.create).toHaveBeenCalledWith(s.tx, {
      userId: 'u-1',
      labBranchId: 'b-1',
      roleMembershipId: 'rm-1',
    });
    expect(s.audit.record).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({ action: 'laboratory.lab_staff.create', resourceId: 'rm-1', actorUserId: 'admin-1' }),
    );
    expect(s.outbox.emit).toHaveBeenCalledWith(s.tx, 'LabStaffProvisioned', {
      laboratoryId: 'lab-1',
      labBranchId: 'b-1',
      userId: 'u-1',
      roleMembershipId: 'rm-1',
    });
    expect(result).toMatchObject({ id: 'rm-1', lab_branch_id: 'b-1', generated_password: 'pw-123', title: 'Tech' });
  });

  it('uses the explicitly requested branch of a multi-branch laboratory', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }]);
    s.resolveLabStaff.findActive.mockResolvedValue(null);

    const result = await s.useCase.execute('lab-1', { ...dto, lab_branch_id: 'b-2' }, actor);

    expect(result.lab_branch_id).toBe('b-2');
    expect(s.provisionStaffUser.execute).toHaveBeenCalledWith(s.tx, expect.objectContaining({ contextId: 'b-2' }));
  });

  it('rejects when the laboratory has no branch', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([]);

    await expect(s.useCase.execute('lab-1', dto, actor)).rejects.toMatchObject({ code: 'LAB_HAS_NO_BRANCH' });
    expect(s.provisionStaffUser.execute).not.toHaveBeenCalled();
  });

  it('409s when an active staff account already exists', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([{ id: 'b-1' }]);
    s.resolveLabStaff.findActive.mockResolvedValue({ labBranchId: 'b-1', staff: {} });

    await expect(s.useCase.execute('lab-1', dto, actor)).rejects.toMatchObject({ code: 'LAB_STAFF_ALREADY_PROVISIONED' });
  });

  it('404s a branch id outside the laboratory', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([{ id: 'b-1' }]);
    s.resolveLabStaff.findActive.mockResolvedValue(null);

    await expect(s.useCase.execute('lab-1', { ...dto, lab_branch_id: 'other' }, actor)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('requires a branch id when the laboratory has several branches', async () => {
    const s = setup();
    s.resolveLabStaff.requireLaboratoryBranches.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }]);
    s.resolveLabStaff.findActive.mockResolvedValue(null);

    await expect(s.useCase.execute('lab-1', dto, actor)).rejects.toMatchObject({ code: 'LAB_BRANCH_REQUIRED' });
  });
});
