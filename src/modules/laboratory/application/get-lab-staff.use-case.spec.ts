import { GetLabStaffUseCase } from './get-lab-staff.use-case';

describe('GetLabStaffUseCase', () => {
  const prisma = { p: true } as any;

  it('returns the mapped staff account', async () => {
    const resolve = {
      findActive: jest.fn().mockResolvedValue({
        labBranchId: 'b-1',
        staff: {
          roleMembershipId: 'rm-1',
          phone: '+20100',
          displayName: 'Name',
          title: null,
          subtitle: null,
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    };
    const result = await new GetLabStaffUseCase(prisma, resolve as any).execute('lab-1');
    expect(resolve.findActive).toHaveBeenCalledWith(prisma, 'lab-1');
    expect(result).toEqual({
      id: 'rm-1',
      phone: '+20100',
      display_name: 'Name',
      title: null,
      subtitle: null,
      lab_branch_id: 'b-1',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns null when no account is provisioned', async () => {
    const resolve = { findActive: jest.fn().mockResolvedValue(null) };
    await expect(new GetLabStaffUseCase(prisma, resolve as any).execute('lab-1')).resolves.toBeNull();
  });
});
