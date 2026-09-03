import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { VerifyDoctorUseCase } from './verify-doctor.use-case';

function buildTx() {
  return {} as any;
}

describe('VerifyDoctorUseCase', () => {
  const actor = { sub: 'admin-user-id', roleMembershipId: 'membership-id', roleCode: 'ADMIN', contextType: 'ADMIN', permissions: [] } as any;

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findById: jest.fn(), setStatus: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const grantRoleMembership = { execute: jest.fn() };
    const useCase = new VerifyDoctorUseCase(prisma as any, doctors as any, audit as any, outbox as any, grantRoleMembership as any);
    return { tx, prisma, doctors, audit, outbox, grantRoleMembership, useCase };
  }

  it('throws NotFoundError when the doctor does not exist', async () => {
    const { doctors, useCase } = setup();
    doctors.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing-id', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sets status to VERIFIED, grants a DOCTOR role membership, records an audit entry, and emits ProviderVerified — all within the transaction', async () => {
    const { tx, doctors, audit, outbox, grantRoleMembership, useCase } = setup();
    doctors.findById.mockResolvedValue({ id: 'doctor-1', user_id: 'user-1', status: 'PENDING', version: 3 });

    await useCase.execute('doctor-1', actor);

    expect(doctors.setStatus).toHaveBeenCalledWith(tx, 'doctor-1', 3, 'VERIFIED');
    expect(grantRoleMembership.execute).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      roleCode: 'DOCTOR',
      contextType: 'DOCTOR',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'admin-user-id',
        action: 'provider_directory.doctor.verify',
        resourceType: 'doctor',
        resourceId: 'doctor-1',
        reasonCode: 'previous_status:PENDING',
      }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderVerified', { providerType: 'DOCTOR', providerId: 'doctor-1' });
  });

  it('is idempotent-safe: verifying an already-VERIFIED doctor still succeeds (Part 32.13)', async () => {
    const { doctors, outbox, grantRoleMembership, useCase } = setup();
    doctors.findById.mockResolvedValue({ id: 'doctor-1', user_id: 'user-1', status: 'VERIFIED', version: 5 });

    await expect(useCase.execute('doctor-1', actor)).resolves.toBeUndefined();
    expect(outbox.emit).toHaveBeenCalledTimes(1);
    expect(grantRoleMembership.execute).toHaveBeenCalledTimes(1);
  });
});
