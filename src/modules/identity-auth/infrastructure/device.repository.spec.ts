import { DeviceRepository } from './device.repository';

describe('DeviceRepository', () => {
  const repo = new DeviceRepository();
  const db: any = {
    device: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  beforeEach(() => jest.resetAllMocks());

  it('upserts by fcm token', async () => {
    db.device.upsert.mockResolvedValue({ id: 'd1' });
    const res = await repo.upsertByToken(db, { userId: 'u', sessionId: 's', fcmToken: 't', platform: 'ios', appVersion: '1' });
    expect(res).toEqual({ id: 'd1' });
    const arg = db.device.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ fcm_token: 't' });
    expect(arg.create).toMatchObject({ user_id: 'u', session_id: 's', fcm_token: 't', platform: 'ios', app_version: '1' });
    expect(arg.update.version).toEqual({ increment: 1 });
  });

  it('detaches refresh tokens on transfer', async () => {
    await repo.detachRefreshTokensOnTransfer(db, 'd', 'u2', 's2');
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { device_id: 'd', OR: [{ user_id: { not: 'u2' } }, { session_id: { not: 's2' } }] },
      data: { device_id: null },
    });
  });

  it('deleteOwnedToken returns count', async () => {
    db.device.deleteMany.mockResolvedValue({ count: 2 });
    expect(await repo.deleteOwnedToken(db, 'u', 's', 't')).toBe(2);
    expect(db.device.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u', fcm_token: 't', OR: [{ session_id: 's' }, { session_id: null }] },
    });
  });

  it('deleteForSession with and without fcm token', async () => {
    db.device.deleteMany.mockResolvedValue({ count: 1 });
    expect(await repo.deleteForSession(db, 'u', 's', 't')).toBe(1);
    expect(db.device.deleteMany).toHaveBeenLastCalledWith({
      where: { user_id: 'u', OR: [{ session_id: 's' }, { fcm_token: 't', session_id: null }] },
    });
    await repo.deleteForSession(db, 'u', 's');
    expect(db.device.deleteMany).toHaveBeenLastCalledWith({ where: { user_id: 'u', OR: [{ session_id: 's' }] } });
  });

  it('deleteAllForUser returns count', async () => {
    db.device.deleteMany.mockResolvedValue({ count: 3 });
    expect(await repo.deleteAllForUser(db, 'u')).toBe(3);
  });

  it('deleteTokensForOwnerSnapshot short-circuits on empty and builds OR otherwise', async () => {
    expect(await repo.deleteTokensForOwnerSnapshot(db, 'u', [])).toEqual({ count: 0 });
    expect(db.device.deleteMany).not.toHaveBeenCalled();
    db.device.deleteMany.mockResolvedValue({ count: 1 });
    await repo.deleteTokensForOwnerSnapshot(db, 'u', [{ id: 'd', fcmToken: 't', sessionId: null, version: 2 }]);
    expect(db.device.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u', OR: [{ id: 'd', fcm_token: 't', session_id: null, version: 2 }] },
    });
  });

  it('listTokensForUser maps rows', async () => {
    db.device.findMany.mockResolvedValue([{ id: 'd', fcm_token: 't', session_id: 's', version: 1 }]);
    expect(await repo.listTokensForUser(db, 'u')).toEqual([{ id: 'd', fcmToken: 't', sessionId: 's', version: 1 }]);
  });
});
