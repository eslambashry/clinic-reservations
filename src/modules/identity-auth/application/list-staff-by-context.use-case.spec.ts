import { ListStaffByContextUseCase } from './list-staff-by-context.use-case';

describe('ListStaffByContextUseCase', () => {
  function setup() {
    const prisma = {};
    const roleMemberships = { listByContext: jest.fn() };
    const useCase = new ListStaffByContextUseCase(prisma as any, roleMemberships as any);
    return { prisma, roleMemberships, useCase };
  }

  it('maps joined role_membership + user rows into flat StaffMember shapes', async () => {
    const { prisma, roleMemberships, useCase } = setup();
    const createdAt = new Date('2026-09-01T00:00:00Z');
    roleMemberships.listByContext.mockResolvedValue([
      {
        id: 'membership-1',
        user_id: 'user-1',
        created_at: createdAt,
        user: { phone: '+201001234567', first_name: 'Sara Ahmed', status: 'ACTIVE' },
      },
    ]);

    const result = await useCase.execute({ roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doctor-1' });

    expect(roleMemberships.listByContext).toHaveBeenCalledWith(prisma, {
      roleCode: 'CLINIC_STAFF',
      contextType: 'CLINIC_STAFF',
      contextId: 'doctor-1',
    });
    expect(result).toEqual([
      {
        roleMembershipId: 'membership-1',
        userId: 'user-1',
        phone: '+201001234567',
        displayName: 'Sara Ahmed',
        status: 'ACTIVE',
        createdAt,
      },
    ]);
  });

  it('returns an empty array when the owner has no staff', async () => {
    const { roleMemberships, useCase } = setup();
    roleMemberships.listByContext.mockResolvedValue([]);

    const result = await useCase.execute({ roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doctor-1' });

    expect(result).toEqual([]);
  });
});
