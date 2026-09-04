import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DeleteAssistantUseCase } from './delete-assistant.use-case';

function buildTx() {
  return {} as any;
}

const actor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

describe('DeleteAssistantUseCase', () => {
  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findByUserId: jest.fn() };
    const revokeStaffMembership = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new DeleteAssistantUseCase(prisma as any, doctors as any, revokeStaffMembership as any, audit as any);
    return { tx, prisma, doctors, revokeStaffMembership, audit, useCase };
  }

  it('404s when the caller has no Doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute('membership-99', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("revokes the membership scoped to the caller's own Doctor.id and records an audit entry", async () => {
    const { tx, doctors, revokeStaffMembership, audit, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });

    await useCase.execute('membership-99', actor);

    expect(revokeStaffMembership.execute).toHaveBeenCalledWith(tx, {
      roleMembershipId: 'membership-99',
      roleCode: 'CLINIC_STAFF',
      contextType: 'CLINIC_STAFF',
      contextId: 'doctor-1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'provider_directory.assistant.revoke', resourceId: 'membership-99' }),
    );
  });
});
