import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RevokeStaffMembershipUseCase } from './revoke-staff-membership.use-case';

function buildTx() {
  return {} as any;
}

const scope = { roleMembershipId: 'membership-1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF' as any, contextId: 'doctor-1' };

describe('RevokeStaffMembershipUseCase', () => {
  function setup() {
    const tx = buildTx();
    const roleMemberships = { findByIdForContext: jest.fn(), setStatus: jest.fn() };
    const useCase = new RevokeStaffMembershipUseCase(roleMemberships as any);
    return { tx, roleMemberships, useCase };
  }

  it('404s when the membership does not belong to this owner', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findByIdForContext.mockResolvedValue(null);

    await expect(useCase.execute(tx, scope)).rejects.toBeInstanceOf(NotFoundError);
    expect(roleMemberships.setStatus).not.toHaveBeenCalled();
  });

  it('flips the membership to REVOKED, never touching the User row', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findByIdForContext.mockResolvedValue({ id: 'membership-1', version: 4 });

    await useCase.execute(tx, scope);

    expect(roleMemberships.setStatus).toHaveBeenCalledWith(tx, 'membership-1', 4, 'REVOKED');
  });
});
