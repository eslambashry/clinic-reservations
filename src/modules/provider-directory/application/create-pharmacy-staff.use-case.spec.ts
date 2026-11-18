import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreatePharmacyStaffUseCase } from './create-pharmacy-staff.use-case';

const actor = { sub: 'admin-1', roleMembershipId: 'rm-admin', contextType: 'ADMIN' } as any;
const dto = { phone: '+201000000000', display_name: 'Sara', title: 'Pharmacist', subtitle: 'Main' } as any;

describe('CreatePharmacyStaffUseCase', () => {
  function setup(branches: any[] = [{ id: 'b1' }]) {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'ph1', deleted_at: null }) };
    const branchRepo = { findByPharmacyId: jest.fn().mockResolvedValue(branches) };
    const staffAssignments = { acquireProvisioningLock: jest.fn(), create: jest.fn() };
    const roleMemberships = { setTitleSubtitle: jest.fn() };
    const listStaff = { execute: jest.fn().mockResolvedValue([]) };
    const provision = {
      execute: jest.fn().mockResolvedValue({
        userId: 'u1',
        roleMembershipId: 'rm1',
        phone: dto.phone,
        displayName: 'Sara',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        generatedPassword: 'pw',
      }),
    };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CreatePharmacyStaffUseCase(
      prisma as any, pharmacies as any, branchRepo as any, staffAssignments as any,
      roleMemberships as any, listStaff as any, provision as any, audit as any, outbox as any,
    );
    return { tx, prisma, pharmacies, branchRepo, staffAssignments, roleMemberships, listStaff, provision, audit, outbox, useCase };
  }

  it('404s when pharmacy missing', async () => {
    const { pharmacies, useCase, provision } = setup();
    pharmacies.findById.mockResolvedValue(null);
    await expect(useCase.execute('ph1', dto, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(provision.execute).not.toHaveBeenCalled();
  });

  it('404s when pharmacy soft-deleted', async () => {
    const { pharmacies, useCase } = setup();
    pharmacies.findById.mockResolvedValue({ id: 'ph1', deleted_at: new Date() });
    await expect(useCase.execute('ph1', dto, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when pharmacy has no branch', async () => {
    const { useCase } = setup([]);
    await expect(useCase.execute('ph1', dto, actor)).rejects.toMatchObject({ code: 'PHARMACY_HAS_NO_BRANCH' });
  });

  it('404s when requested branch is not in this pharmacy', async () => {
    const { useCase } = setup();
    await expect(useCase.execute('ph1', { ...dto, pharmacy_branch_id: 'other' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('requires a branch id when pharmacy has several branches', async () => {
    const { useCase } = setup([{ id: 'b1' }, { id: 'b2' }]);
    const err = await useCase.execute('ph1', dto, actor).catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect(err.code).toBe('PHARMACY_BRANCH_REQUIRED');
  });

  it('conflicts when staff already exists on any branch', async () => {
    const { useCase, listStaff, provision } = setup([{ id: 'b1' }, { id: 'b2' }]);
    listStaff.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'x' }]);
    await expect(useCase.execute('ph1', { ...dto, pharmacy_branch_id: 'b1' }, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(provision.execute).not.toHaveBeenCalled();
  });

  it('provisions staff on the single branch', async () => {
    const { tx, useCase, provision, roleMemberships, staffAssignments, audit, outbox, prisma } = setup();
    const res = await useCase.execute('ph1', dto, actor);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
    expect(provision.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ contextId: 'b1', roleCode: 'PHARMACY_STAFF' }));
    expect(roleMemberships.setTitleSubtitle).toHaveBeenCalledWith(tx, 'rm1', { title: 'Pharmacist', subtitle: 'Main' });
    expect(staffAssignments.create).toHaveBeenCalledWith(tx, { userId: 'u1', pharmacyBranchId: 'b1', roleMembershipId: 'rm1' });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'rm1' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyStaffProvisioned', expect.objectContaining({ pharmacyBranchId: 'b1' }));
    expect(res).toBeDefined();
  });

  it('uses explicit branch id among several', async () => {
    const { useCase, provision } = setup([{ id: 'b1' }, { id: 'b2' }]);
    await useCase.execute('ph1', { ...dto, pharmacy_branch_id: 'b2' }, actor);
    expect(provision.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contextId: 'b2' }));
  });
});
