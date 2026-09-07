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
    const affiliations = { findByDoctorId: jest.fn().mockResolvedValue([{ clinic_branch_id: 'branch-1' }]) };
    const staffAssignments = {
      replaceForRoleMembership: jest.fn(),
      findClinicBranchIdsByRoleMembership: jest.fn().mockResolvedValue([]),
    };
    const updateStaffMembership = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const useCase = new UpdateAssistantUseCase(
      prisma as any,
      doctors as any,
      affiliations as any,
      staffAssignments as any,
      updateStaffMembership as any,
      audit as any,
    );
    return { tx, prisma, doctors, affiliations, staffAssignments, updateStaffMembership, audit, useCase };
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
      title: null,
      subtitle: null,
      clinicBranchIds: [],
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
      password: undefined,
      title: undefined,
      subtitle: undefined,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'provider_directory.assistant.update', resourceId: 'membership-99' }),
    );
    expect(result).toEqual({
      id: 'membership-99',
      phone: '+201001234567',
      display_name: 'New Name',
      title: null,
      subtitle: null,
      clinic_branch_ids: [],
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
      title: null,
      subtitle: null,
      clinicBranchIds: [],
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

  it("replaces the assistant's assigned branches when clinic_branch_ids is provided (full replace)", async () => {
    const { tx, doctors, staffAssignments, updateStaffMembership, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    updateStaffMembership.execute.mockResolvedValue({
      roleMembershipId: 'membership-99',
      userId: 'assistant-user-1',
      phone: '+201001234567',
      displayName: 'Sara',
      title: null,
      subtitle: null,
      status: 'ACTIVE',
      createdAt: new Date('2026-09-04T12:00:00Z'),
    });

    const result = await useCase.execute('membership-99', { clinic_branch_ids: ['branch-1'] }, actor);

    expect(staffAssignments.replaceForRoleMembership).toHaveBeenCalledWith(tx, 'membership-99', ['branch-1']);
    expect(result.clinic_branch_ids).toEqual(['branch-1']);
  });

  it("404s when a replacement clinic_branch_id doesn't belong to the calling doctor", async () => {
    const { doctors, affiliations, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    affiliations.findByDoctorId.mockResolvedValue([{ clinic_branch_id: 'some-other-branch' }]);

    await expect(
      useCase.execute('membership-99', { clinic_branch_ids: ['branch-1'] }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
