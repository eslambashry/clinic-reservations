import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeleteMyClinicBranchUseCase } from './delete-my-clinic-branch.use-case';

const actor = { sub: 'u1', roleMembershipId: 'rm1' } as any;

describe('DeleteMyClinicBranchUseCase', () => {
  function setup() {
    const tx = {
      appointment: { count: jest.fn().mockResolvedValue(0) },
      doctorClinicAffiliation: { count: jest.fn().mockResolvedValue(0), delete: jest.fn() },
      clinicBranch: { findUnique: jest.fn().mockResolvedValue({ address_id: 'ad1' }), delete: jest.fn() },
      address: { delete: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const scope = {
      execute: jest.fn().mockResolvedValue({ doctorId: 'd1', affiliations: [{ clinicBranchId: 'br1', affiliationId: 'aff1' }] }),
    };
    const audit = { record: jest.fn() };
    const useCase = new DeleteMyClinicBranchUseCase(prisma as any, scope as any, audit as any);
    return { tx, scope, audit, useCase };
  }

  it('404s when branch not owned', async () => {
    const { useCase, tx } = setup();
    await expect(useCase.execute('zzz', actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.appointment.count).not.toHaveBeenCalled();
  });

  it('conflicts when active bookings exist', async () => {
    const { useCase, tx } = setup();
    tx.appointment.count.mockResolvedValue(2);
    await expect(useCase.execute('br1', actor)).rejects.toBeInstanceOf(ConflictError);
    expect(tx.doctorClinicAffiliation.delete).not.toHaveBeenCalled();
  });

  it('404s when the branch row is gone', async () => {
    const { useCase, tx } = setup();
    tx.clinicBranch.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('br1', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes affiliation, branch and address when sole owner', async () => {
    const { useCase, tx, audit } = setup();
    await useCase.execute('br1', actor);
    expect(tx.doctorClinicAffiliation.delete).toHaveBeenCalledWith({ where: { id: 'aff1' } });
    expect(tx.clinicBranch.delete).toHaveBeenCalledWith({ where: { id: 'br1' } });
    expect(tx.address.delete).toHaveBeenCalledWith({ where: { id: 'ad1' } });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'br1' }));
  });

  it('only removes the affiliation when other doctors share the branch', async () => {
    const { useCase, tx } = setup();
    tx.doctorClinicAffiliation.count.mockResolvedValue(1);
    await useCase.execute('br1', actor);
    expect(tx.doctorClinicAffiliation.delete).toHaveBeenCalled();
    expect(tx.clinicBranch.delete).not.toHaveBeenCalled();
    expect(tx.address.delete).not.toHaveBeenCalled();
  });
});
