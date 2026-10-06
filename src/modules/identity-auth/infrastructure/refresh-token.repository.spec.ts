import { lockUserForAuthMutation, RefreshTokenRepository } from './refresh-token.repository';

describe('RefreshTokenRepository', () => {
  const repo = new RefreshTokenRepository();
  const db: any = {
    $queryRaw: jest.fn(),
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  };
  beforeEach(() => jest.resetAllMocks());

  it('lockUserForAuthMutation issues a FOR UPDATE query', async () => {
    await lockUserForAuthMutation(db, 'u');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE');
  });

  it('instance lock delegates', async () => {
    await repo.lockUserForAuthMutation(db, 'u');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('create maps params', async () => {
    const expiresAt = new Date();
    await repo.create(db, { userId: 'u', tokenHash: 'h', sessionId: 's', expiresAt, deviceId: 'd', rotatedFromTokenId: 'r' });
    expect(db.refreshToken.create).toHaveBeenCalledWith({
      data: { user_id: 'u', token_hash: 'h', session_id: 's', expires_at: expiresAt, device_id: 'd', rotated_from_token_id: 'r' },
    });
  });

  it('findByTokenHash', async () => {
    await repo.findByTokenHash(db, 'h');
    expect(db.refreshToken.findUnique).toHaveBeenCalledWith({ where: { token_hash: 'h' } });
  });

  it('revoke returns true only when exactly one row updated', async () => {
    db.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await repo.revoke(db, 'i')).toBe(true);
    expect(await repo.revoke(db, 'i')).toBe(false);
    expect(db.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ id: 'i', revoked_at: null });
  });

  it('lockLiveSession reflects row presence', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 'x' }]).mockResolvedValueOnce([]);
    expect(await repo.lockLiveSession(db, 'u', 's')).toBe(true);
    expect(await repo.lockLiveSession(db, 'u', 's')).toBe(false);
  });

  it('revokeSession and revokeAllActiveForUser return counts', async () => {
    db.refreshToken.updateMany.mockResolvedValue({ count: 4 });
    expect(await repo.revokeSession(db, 'u', 's')).toBe(4);
    expect(db.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ user_id: 'u', session_id: 's', revoked_at: null });
    expect(await repo.revokeAllActiveForUser(db, 'u')).toBe(4);
    expect(db.refreshToken.updateMany.mock.calls[1][0].where).toEqual({ user_id: 'u', revoked_at: null });
  });
});
