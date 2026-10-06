import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdatePharmacyStaffUseCase } from './update-pharmacy-staff.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm-a' } as any;
const dto = { display_name: 'New', status: 'SUSPENDED', title: 'T', subtitle: 'S' } as any;

describe('UpdatePharmacyStaffUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'ph1', deleted_at: null }) };
    const staffAssignments = { findBranchIdForPharmacy: jest.fn().mockResolvedValue('b1') };
    const update = {
      execute: jest.fn().mockResolvedValue({
        roleMembershipId: 'rm1', phone: '+20', displayName: 'New', title: 'T', subtitle: 'S',
        status: 'SUSPENDED', createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    };
    const audit = { record: jest.fn() };
    const useCase = new UpdatePharmacyStaffUseCase(prisma as any, pharmacies as any, staffAssignments as any, update as any, audit as any);
    return { tx, pharmacies, staffAssignments, update, audit, useCase };
  }

  it.each([[null], [{ id: 'ph1', deleted_at: new Date() }]])('404s for missing or deleted pharmacy', async (p) => {
    const { useCase, pharmacies } = setup();
    pharmacies.findById.mockResolvedValue(p);
    await expect(useCase.execute('ph1', 'rm1', dto, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when staff is not assigned to this pharmacy', async () => {
    const { useCase, staffAssignments, update } = setup();
    staffAssignments.findBranchIdForPharmacy.mockResolvedValue(null);
    await expect(useCase.execute('ph1', 'rm1', dto, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(update.execute).not.toHaveBeenCalled();
  });

  it('updates, audits and returns the response', async () => {
    const { tx, useCase, update, audit } = setup();
    const res = await useCase.execute('ph1', 'rm1', dto, actor);
    expect(update.execute).toHaveBeenCalledWith(tx, expect.objectContaining({
      roleMembershipId: 'rm1', contextId: 'b1', displayName: 'New', status: 'SUSPENDED',
    }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'rm1' }));
    expect(res).toMatchObject({ id: 'rm1', pharmacy_branch_id: 'b1', status: 'SUSPENDED' });
  });
});
