import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetCurrentUserUseCase } from './get-current-user.use-case';

describe('GetCurrentUserUseCase', () => {
  function setup() {
    const prisma = {};
    const users = { findById: jest.fn() };
    const roleMemberships = { findActiveByUser: jest.fn() };
    const useCase = new GetCurrentUserUseCase(prisma as any, users as any, roleMemberships as any);
    return { prisma, users, roleMemberships, useCase };
  }

  it('404s when the JWT subject no longer resolves to a user', async () => {
    const { users, useCase } = setup();
    users.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'missing', activeRoleCode: 'PATIENT' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the user with every active role plus which one is the token active context', async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findById.mockResolvedValue({ id: 'user-1', phone: '+201001234567', first_name: 'Nour', last_name: 'Ahmed' });
    roleMemberships.findActiveByUser.mockResolvedValue([{ role_code: 'PATIENT', context_id: null }]);

    const result = await useCase.execute({ userId: 'user-1', activeRoleCode: 'PATIENT' });

    expect(result).toEqual({
      id: 'user-1',
      phone: '+201001234567',
      roles: ['PATIENT'],
      activeRole: 'PATIENT',
      displayName: 'Nour Ahmed',
      contextId: null,
    });
  });

  it("returns the active membership's own contextId for a branch-scoped role (PHARMACY_STAFF)", async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findById.mockResolvedValue({ id: 'user-1', phone: '+201001234567', first_name: 'Mona', last_name: 'Adel' });
    roleMemberships.findActiveByUser.mockResolvedValue([{ role_code: 'PHARMACY_STAFF', context_id: 'branch-1' }]);

    const result = await useCase.execute({ userId: 'user-1', activeRoleCode: 'PHARMACY_STAFF' });

    expect(result.contextId).toBe('branch-1');
  });

  it('falls back to a null displayName when neither name field is set', async () => {
    const { users, roleMemberships, useCase } = setup();
    users.findById.mockResolvedValue({ id: 'user-1', phone: '+201001234567', first_name: null, last_name: null });
    roleMemberships.findActiveByUser.mockResolvedValue([]);

    const result = await useCase.execute({ userId: 'user-1', activeRoleCode: 'PATIENT' });

    expect(result.displayName).toBeNull();
    expect(result.roles).toEqual([]);
  });
});
