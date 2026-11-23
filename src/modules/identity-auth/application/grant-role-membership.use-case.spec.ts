import { GrantRoleMembershipUseCase } from './grant-role-membership.use-case';

describe('GrantRoleMembershipUseCase', () => {
  function setup() {
    const tx = {} as any;
    const roleMemberships = { findActiveByUser: jest.fn(), create: jest.fn(), convertPersonalRole: jest.fn().mockResolvedValue(false) };
    const useCase = new GrantRoleMembershipUseCase(roleMemberships as any);
    return { tx, roleMemberships, useCase };
  }

  it('creates a new role membership when the user has none matching', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ role_code: 'PATIENT', context_type: 'PATIENT' }]);

    await useCase.execute(tx, { userId: 'user-1', roleCode: 'DOCTOR', contextType: 'DOCTOR' as any });

    expect(roleMemberships.create).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      roleCode: 'DOCTOR',
      contextType: 'DOCTOR',
    });
  });

  it('is idempotent: does nothing when the exact role/context membership already exists', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ role_code: 'DOCTOR', context_type: 'DOCTOR' }]);

    await useCase.execute(tx, { userId: 'user-1', roleCode: 'DOCTOR', contextType: 'DOCTOR' as any });

    expect(roleMemberships.create).not.toHaveBeenCalled();
  });

  it('does not treat a different context type as a match — creates a new membership', async () => {
    const { tx, roleMemberships, useCase } = setup();
    roleMemberships.findActiveByUser.mockResolvedValue([{ role_code: 'DOCTOR', context_type: 'CLINIC_STAFF' }]);

    await useCase.execute(tx, { userId: 'user-1', roleCode: 'DOCTOR', contextType: 'DOCTOR' as any });

    expect(roleMemberships.create).toHaveBeenCalledTimes(1);
  });
});

describe('GrantRoleMembershipUseCase — one personal role per account', () => {
  it('converts PATIENT to DOCTOR in place instead of adding a second membership', async () => {
    const tx = {} as any;
    const roleMemberships = {
      findActiveByUser: jest.fn().mockResolvedValue([{ role_code: 'PATIENT', context_type: 'PATIENT' }]),
      create: jest.fn(),
      convertPersonalRole: jest.fn().mockResolvedValue(true),
    };
    const useCase = new GrantRoleMembershipUseCase(roleMemberships as any);

    await useCase.execute(tx, { userId: 'user-1', roleCode: 'DOCTOR', contextType: 'DOCTOR' as any });

    expect(roleMemberships.convertPersonalRole).toHaveBeenCalledWith(tx, { userId: 'user-1', from: 'PATIENT', to: 'DOCTOR' });
    expect(roleMemberships.create).not.toHaveBeenCalled();
  });
});
