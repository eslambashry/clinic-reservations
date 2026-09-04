import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { UpdateStaffMembershipUseCase } from './update-staff-membership.use-case';

function buildTx() {
  return {} as any;
}

const scope = { roleMembershipId: 'membership-1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doctor-1' };

describe('UpdateStaffMembershipUseCase', () => {
  function setup() {
    const tx = buildTx();
    const users = { updateProfile: jest.fn(), setStatus: jest.fn() };
    const roleMemberships = { findByIdForContext: jest.fn() };
    const useCase = new UpdateStaffMembershipUseCase(users as any, roleMemberships as any);
    return { tx, users, roleMemberships, useCase };
  }

  it('404s (never 403s) when the membership does not belong to this owner — prevents IDOR-style probing', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findByIdForContext.mockResolvedValue(null);

    await expect(useCase.execute(tx, { ...scope, displayName: 'New Name' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates only display_name when status is omitted', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    const membership = {
      id: 'membership-1',
      created_at: new Date('2026-09-01T00:00:00Z'),
      user: { id: 'user-1', phone: '+201001234567', first_name: 'Old Name', status: 'ACTIVE' },
    };
    roleMemberships.findByIdForContext.mockResolvedValue(membership);
    users.updateProfile.mockResolvedValue({ id: 'user-1', phone: '+201001234567', first_name: 'New Name', status: 'ACTIVE' });

    const result = await useCase.execute(tx, { ...scope, displayName: 'New Name' });

    expect(users.updateProfile).toHaveBeenCalledWith(tx, 'user-1', { firstName: 'New Name' });
    expect(users.setStatus).not.toHaveBeenCalled();
    expect(result.displayName).toBe('New Name');
  });

  it('updates only status when display_name is omitted', async () => {
    const { tx, users, roleMemberships, useCase } = setup();
    const membership = {
      id: 'membership-1',
      created_at: new Date('2026-09-01T00:00:00Z'),
      user: { id: 'user-1', phone: '+201001234567', first_name: 'Sara Ahmed', status: 'ACTIVE' },
    };
    roleMemberships.findByIdForContext.mockResolvedValue(membership);
    users.setStatus.mockResolvedValue({ id: 'user-1', phone: '+201001234567', first_name: 'Sara Ahmed', status: 'SUSPENDED' });

    const result = await useCase.execute(tx, { ...scope, status: 'SUSPENDED' as any });

    expect(users.setStatus).toHaveBeenCalledWith(tx, 'user-1', 'SUSPENDED');
    expect(users.updateProfile).not.toHaveBeenCalled();
    expect(result.status).toBe('SUSPENDED');
  });
});
