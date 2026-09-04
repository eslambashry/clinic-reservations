import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateAssistantUseCase } from './create-assistant.use-case';

function buildTx() {
  return {} as any;
}

const actor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
const dto = { phone: '+201001234567', display_name: 'Sara Ahmed' };

describe('CreateAssistantUseCase', () => {
  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findByUserId: jest.fn() };
    const provisionStaffUser = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CreateAssistantUseCase(prisma as any, doctors as any, provisionStaffUser as any, audit as any, outbox as any);
    return { tx, prisma, doctors, provisionStaffUser, audit, outbox, useCase };
  }

  it('404s when the caller has no Doctor row, and never calls provisioning', async () => {
    const { doctors, provisionStaffUser, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute(dto, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(provisionStaffUser.execute).not.toHaveBeenCalled();
  });

  it('never audits or emits an outbox event when provisioning fails — the whole call rejects so the transaction rolls back everything, not just the failed step', async () => {
    const { doctors, provisionStaffUser, audit, outbox, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    provisionStaffUser.execute.mockRejectedValue(new Error('simulated mid-transaction failure'));

    await expect(useCase.execute(dto, actor)).rejects.toThrow('simulated mid-transaction failure');
    expect(audit.record).not.toHaveBeenCalled();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('provisions the assistant scoped to the caller Doctor.id (not User.id), audits, emits AssistantProvisioned, and returns the snake_case contract shape including the one-time password', async () => {
    const { tx, doctors, provisionStaffUser, audit, outbox, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1', user_id: 'doctor-user-1' });
    provisionStaffUser.execute.mockResolvedValue({
      userId: 'assistant-user-1',
      roleMembershipId: 'membership-99',
      phone: '+201001234567',
      displayName: 'Sara Ahmed',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-04T12:00:00Z'),
      generatedPassword: 'PlaintextOnce1!',
    });

    const result = await useCase.execute(dto, actor);

    expect(provisionStaffUser.execute).toHaveBeenCalledWith(tx, {
      phone: dto.phone,
      displayName: dto.display_name,
      roleCode: 'CLINIC_STAFF',
      contextType: 'CLINIC_STAFF',
      contextId: 'doctor-1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'doctor-user-1',
        action: 'provider_directory.assistant.create',
        resourceType: 'role_membership',
        resourceId: 'membership-99',
      }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AssistantProvisioned', {
      doctorId: 'doctor-1',
      userId: 'assistant-user-1',
      roleMembershipId: 'membership-99',
    });
    expect(result).toEqual({
      id: 'membership-99',
      phone: '+201001234567',
      display_name: 'Sara Ahmed',
      status: 'ACTIVE',
      created_at: '2026-09-04T12:00:00.000Z',
      generated_password: 'PlaintextOnce1!',
    });
  });
});
