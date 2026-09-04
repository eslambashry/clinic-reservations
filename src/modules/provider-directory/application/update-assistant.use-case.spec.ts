import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateAssistantUseCase } from './update-assistant.use-case';

function buildTx() {
  return {} as any;
}

const actor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

describe('UpdateAssistantUseCase', () => {
  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { findByUserId: jest.fn() };
    const updateStaffMembership = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new UpdateAssistantUseCase(prisma as any, doctors as any, updateStaffMembership as any, audit as any);
    return { tx, prisma, doctors, updateStaffMembership, audit, useCase };
  }

  it('404s when the caller has no Doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute('membership-99', { display_name: 'New Name' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("scopes the update to the caller's own Doctor.id, forwarding it as the ownership contextId — IDOR prevention lives in identity-auth's lookup", async () => {
    const { tx, doctors, updateStaffMembership, audit, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    updateStaffMembership.execute.mockResolvedValue({
      roleMembershipId: 'membership-99',
      userId: 'assistant-user-1',
      phone: '+201001234567',
      displayName: 'New Name',
      status: 'SUSPENDED',
      password: undefined,
      createdAt: new Date('2026-09-04T12:00:00Z'),
    });

    const result = await useCase.execute('membership-99', { display_name: 'New Name', status: 'SUSPENDED' as any }, actor);

    expect(updateStaffMembership.execute).toHaveBeenCalledWith(tx, {
      roleMembershipId: 'membership-99',
      roleCode: 'CLINIC_STAFF',
      contextType: 'CLINIC_STAFF',
      contextId: 'doctor-1',
      displayName: 'New Name',
      status: 'SUSPENDED',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'provider_directory.assistant.update', resourceId: 'membership-99' }),
    );
    expect(result).toEqual({
      id: 'membership-99',
      phone: '+201001234567',
      display_name: 'New Name',
      status: 'SUSPENDED',
      created_at: '2026-09-04T12:00:00.000Z',
    });
  });

  it('forwards a new password and returns it once without exposing it when absent', async () => {
    const { tx, doctors, updateStaffMembership, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    updateStaffMembership.execute.mockResolvedValue({
      roleMembershipId: 'membership-99',
      userId: 'assistant-user-1',
      phone: '+201001234567',
      displayName: 'Sara',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-04T12:00:00Z'),
      generatedPassword: 'NewPass1!',
    });

    const result = await useCase.execute(
      'membership-99',
      { password: 'NewPass1!' },
      actor,
    );

    expect(updateStaffMembership.execute).toHaveBeenCalledWith(tx, expect.objectContaining({
      password: 'NewPass1!',
    }));
    expect(result).toEqual(expect.objectContaining({ generated_password: 'NewPass1!' }));
  });
});
