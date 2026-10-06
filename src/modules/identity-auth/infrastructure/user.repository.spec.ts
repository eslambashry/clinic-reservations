import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  const refreshTokens: any = { lockUserForAuthMutation: jest.fn(), revokeAllActiveForUser: jest.fn() };
  const devices: any = { deleteAllForUser: jest.fn() };
  const repo = new UserRepository(refreshTokens, devices);
  const db: any = { user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }, roleMembership: { findMany: jest.fn() } };
  beforeEach(() => jest.resetAllMocks());

  it('finders and create', async () => {
    await repo.findById(db, 'i');
    expect(db.user.findUnique).toHaveBeenLastCalledWith({ where: { id: 'i' } });
    await repo.findByPhone(db, 'p');
    expect(db.user.findUnique).toHaveBeenLastCalledWith({ where: { phone: 'p' } });
    await repo.create(db, 'p', 'n');
    expect(db.user.create).toHaveBeenCalledWith({ data: { phone: 'p', first_name: 'n' } });
  });

  it('lockForAuthMutation delegates', async () => {
    await repo.lockForAuthMutation(db, 'i');
    expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalledWith(db, 'i');
  });

  describe('setPassword', () => {
    it('updates the hash', async () => {
      db.roleMembership.findMany.mockResolvedValue([]);
      db.user.update.mockResolvedValue({ id: 'i' });
      expect(await repo.setPassword(db, 'i', 'h')).toEqual({ id: 'i' });
      expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalled();
      expect(db.user.update.mock.calls[0][0].data.password_hash).toBe('h');
    });
    it('throws on staff identity conflict', async () => {
      db.roleMembership.findMany.mockResolvedValue([
        { role_code: 'CLINIC_STAFF', context_type: 'CLINIC_STAFF', context_id: 'c' },
        { role_code: 'PATIENT', context_type: 'PATIENT', context_id: null },
      ]);
      await expect(repo.setPassword(db, 'i', 'h')).rejects.toBeInstanceOf(ConflictError);
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('ACTIVE does not revoke sessions', async () => {
      db.user.update.mockResolvedValue({ id: 'i' });
      await repo.setStatus(db, 'i', 'ACTIVE' as any);
      expect(refreshTokens.revokeAllActiveForUser).not.toHaveBeenCalled();
      expect(devices.deleteAllForUser).not.toHaveBeenCalled();
    });
    it('non-ACTIVE revokes tokens and devices', async () => {
      db.user.update.mockResolvedValue({ id: 'i' });
      await repo.setStatus(db, 'i', 'SUSPENDED' as any);
      expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(db, 'i');
      expect(devices.deleteAllForUser).toHaveBeenCalledWith(db, 'i');
    });
  });

  it('updateProfile only includes provided fields', async () => {
    await repo.updateProfile(db, 'i', { firstName: 'a', lastName: 'b', email: 'e' });
    expect(db.user.update).toHaveBeenLastCalledWith({ where: { id: 'i' }, data: { first_name: 'a', last_name: 'b', email: 'e' } });
    await repo.updateProfile(db, 'i', {});
    expect(db.user.update).toHaveBeenLastCalledWith({ where: { id: 'i' }, data: {} });
  });
});
