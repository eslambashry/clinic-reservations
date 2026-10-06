import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeletePharmacyStaffUseCase } from './delete-pharmacy-staff.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm-a' } as any;

describe('DeletePharmacyStaffUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const pharmacies = { findById: jest.fn().mockResolvedValue({ id: 'ph1', deleted_at: null }) };
    const staffAssignments = { findBranchIdForPharmacy: jest.fn().mockResolvedValue('b1') };
    const revoke = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new DeletePharmacyStaffUseCase(prisma as any, pharmacies as any, staffAssignments as any, revoke as any, audit as any);
    return { tx, pharmacies, staffAssignments, revoke, audit, useCase };
  }

  it.each([[null], [{ id: 'ph1', deleted_at: new Date() }]])('404s for missing or deleted pharmacy', async (p) => {
    const { useCase, pharmacies } = setup();
    pharmacies.findById.mockResolvedValue(p);
    await expect(useCase.execute('ph1', 'rm1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when staff not in pharmacy', async () => {
    const { useCase, staffAssignments, revoke } = setup();
    staffAssignments.findBranchIdForPharmacy.mockResolvedValue(null);
    await expect(useCase.execute('ph1', 'rm1', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(revoke.execute).not.toHaveBeenCalled();
  });

  it('revokes and audits', async () => {
    const { tx, useCase, revoke, audit } = setup();
    await useCase.execute('ph1', 'rm1', actor);
    expect(revoke.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ roleMembershipId: 'rm1', contextId: 'b1' }));
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'rm1', action: 'provider_directory.pharmacy_staff.revoke' }));
  });
});
