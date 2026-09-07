import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ListAssistantsUseCase } from './list-assistants.use-case';

const actor = { sub: 'doctor-user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;

describe('ListAssistantsUseCase', () => {
  function setup() {
    const prisma = {};
    const doctors = { findByUserId: jest.fn() };
    const listStaff = { execute: jest.fn() };
    const staffAssignments = { findClinicBranchIdsByRoleMembershipIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListAssistantsUseCase(prisma as any, doctors as any, listStaff as any, staffAssignments as any);
    return { prisma, doctors, listStaff, staffAssignments, useCase };
  }

  it('404s when the caller has no Doctor row', async () => {
    const { doctors, useCase } = setup();
    doctors.findByUserId.mockResolvedValue(null);

    await expect(useCase.execute(actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("scopes the lookup to the caller's own Doctor.id and returns the contract shape", async () => {
    const { doctors, listStaff, staffAssignments, useCase } = setup();
    doctors.findByUserId.mockResolvedValue({ id: 'doctor-1' });
    listStaff.execute.mockResolvedValue([
      {
        roleMembershipId: 'membership-99',
        userId: 'assistant-user-1',
        phone: '+201001234567',
        displayName: 'Sara Ahmed',
        title: null,
        subtitle: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-09-04T12:00:00Z'),
      },
    ]);
    staffAssignments.findClinicBranchIdsByRoleMembershipIds.mockResolvedValue(
      new Map([['membership-99', ['branch-1']]]),
    );

    const result = await useCase.execute(actor);

    expect(listStaff.execute).toHaveBeenCalledWith({ roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', contextId: 'doctor-1' });
    expect(result).toEqual([
      {
        id: 'membership-99',
        phone: '+201001234567',
        display_name: 'Sara Ahmed',
        title: null,
        subtitle: null,
        clinic_branch_ids: ['branch-1'],
        status: 'ACTIVE',
        created_at: '2026-09-04T12:00:00.000Z',
      },
    ]);
  });
});
