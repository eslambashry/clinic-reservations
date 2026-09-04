import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateMyClinicBranchUseCase } from './update-my-clinic-branch.use-case';

describe('UpdateMyClinicBranchUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const updatedClinic = { clinicBranchId: 'branch-1', affiliationId: 'aff-1' } as any;

  function setup(clinicBranchIds = ['branch-1']) {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctorScope = { execute: jest.fn().mockResolvedValue({ doctorId: 'doctor-1', affiliations: [], affiliationIds: ['aff-1'], clinicBranchIds }) };
    const branches = { findByIdWithRelations: jest.fn(), update: jest.fn() };
    const addresses = { update: jest.fn() };
    const audit = { record: jest.fn() };
    const listMyClinics = { execute: jest.fn().mockResolvedValue({ items: [updatedClinic] }) };
    const useCase = new UpdateMyClinicBranchUseCase(
      prisma as any,
      doctorScope as any,
      branches as any,
      addresses as any,
      audit as any,
      listMyClinics as any,
    );
    return { tx, prisma, doctorScope, branches, addresses, audit, listMyClinics, useCase };
  }

  it('404s a branch the caller is not affiliated with, without ever reading it', async () => {
    const { branches, prisma, useCase } = setup(['branch-other']);

    await expect(useCase.execute('branch-1', { phone: '+201111111111' }, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(branches.findByIdWithRelations).not.toHaveBeenCalled();
  });

  it('updates operational branch fields and audits the write in the same transaction', async () => {
    const { tx, branches, audit, useCase } = setup();
    branches.findByIdWithRelations.mockResolvedValue({ version: 4, address_id: 'address-1', address: { version: 2 } });

    const result = await useCase.execute('branch-1', { phone: '+201111111111', ianaTimezone: 'Africa/Cairo' }, actor);

    expect(branches.update).toHaveBeenCalledWith(tx, 'branch-1', 4, { phone: '+201111111111', ianaTimezone: 'Africa/Cairo' });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      actorUserId: 'user-1',
      actorRoleMembershipId: 'membership-1',
      action: 'provider_directory.clinic_branch.update_by_doctor',
      resourceType: 'clinic_branch',
      resourceId: 'branch-1',
    });
    expect(result).toBe(updatedClinic);
  });

  it('updates the address through its own optimistic-lock version', async () => {
    const { tx, branches, addresses, useCase } = setup();
    branches.findByIdWithRelations.mockResolvedValue({ version: 4, address_id: 'address-1', address: { version: 2 } });

    await useCase.execute('branch-1', { address: { line1: '5 Corniche', city: 'Alexandria' } }, actor);

    expect(addresses.update).toHaveBeenCalledWith(tx, 'address-1', 2, { line1: '5 Corniche', city: 'Alexandria' });
    expect(branches.update).not.toHaveBeenCalled();
  });

  it('never writes the branch when only an empty address object is sent', async () => {
    const { branches, addresses, useCase } = setup();
    branches.findByIdWithRelations.mockResolvedValue({ version: 4, address_id: 'address-1', address: { version: 2 } });

    await useCase.execute('branch-1', { address: {} }, actor);

    expect(branches.update).not.toHaveBeenCalled();
    expect(addresses.update).not.toHaveBeenCalled();
  });
});
