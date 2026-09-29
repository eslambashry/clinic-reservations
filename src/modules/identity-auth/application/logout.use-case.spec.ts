import { LogoutUseCase } from './logout.use-case';

jest.mock('../domain/refresh-token.util', () => ({
  hashRefreshToken: jest.fn((token: string) => `hashed:${token}`),
}));

describe('LogoutUseCase', () => {
  const rawToken = 'raw-refresh-token';
  const existing = { id: 'token-1', user_id: 'user-1', session_id: 'session-1', revoked_at: null as Date | null };

  function setup() {
    const tx = { tx: true };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const refreshTokens = { findByTokenHash: jest.fn(), lockUserForAuthMutation: jest.fn(), revokeSession: jest.fn(), revokeAllActiveForUser: jest.fn() };
    const devices = { deleteForSession: jest.fn(), deleteAllForUser: jest.fn() };
    const useCase = new LogoutUseCase(prisma as any, refreshTokens as any, devices as any);
    return { tx, prisma, refreshTokens, devices, useCase };
  }

  it('is a no-op success for an unrecognized token — logout must never reveal whether a token value is valid', async () => {
    const { refreshTokens, devices, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: rawToken, fcmToken: 'fcm-1' })).resolves.toBeUndefined();
    expect(refreshTokens.revokeSession).not.toHaveBeenCalled();
    expect(devices.deleteForSession).not.toHaveBeenCalled();
  });

  it('ends the whole session and releases its devices plus the presented FCM token, inside one transaction', async () => {
    const { tx, prisma, refreshTokens, devices, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(existing);

    await useCase.execute({ refreshToken: rawToken, fcmToken: 'fcm-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(refreshTokens.findByTokenHash).toHaveBeenCalledWith(tx, 'hashed:raw-refresh-token');
    expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalledWith(tx, 'user-1');
    expect(refreshTokens.revokeSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1');
    expect(devices.deleteForSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1', 'fcm-1');
    expect(refreshTokens.revokeAllActiveForUser).not.toHaveBeenCalled();
  });

  it('revokes the session before releasing devices, so an in-flight registration serializes ahead of the delete', async () => {
    const { refreshTokens, devices, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(existing);
    const order: string[] = [];
    refreshTokens.revokeSession.mockImplementation(async () => { order.push('revoke'); });
    devices.deleteForSession.mockImplementation(async () => { order.push('delete'); });

    await useCase.execute({ refreshToken: rawToken });

    expect(order).toEqual(['revoke', 'delete']);
  });

  it('still ends the session a rotated-out token belongs to, without honoring allDevices for it', async () => {
    const { tx, refreshTokens, devices, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue({ ...existing, revoked_at: new Date() });

    await useCase.execute({ refreshToken: rawToken, allDevices: true });

    expect(refreshTokens.revokeAllActiveForUser).not.toHaveBeenCalled();
    expect(devices.deleteAllForUser).not.toHaveBeenCalled();
    expect(refreshTokens.revokeSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1');
    expect(devices.deleteForSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1', undefined);
  });

  it('revokes every active token and releases every device for the user when allDevices is set', async () => {
    const { tx, refreshTokens, devices, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(existing);

    await useCase.execute({ refreshToken: rawToken, allDevices: true });

    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(tx, 'user-1');
    expect(devices.deleteAllForUser).toHaveBeenCalledWith(tx, 'user-1');
    expect(refreshTokens.revokeSession).not.toHaveBeenCalled();
  });
});
