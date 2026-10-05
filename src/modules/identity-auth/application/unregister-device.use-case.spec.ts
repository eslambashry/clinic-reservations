import { UnregisterDeviceUseCase } from './unregister-device.use-case';

describe('UnregisterDeviceUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const devices = { deleteOwnedToken: jest.fn() };
    const refreshTokens = {
      lockUserForAuthMutation: jest.fn(),
      lockLiveSession: jest.fn().mockResolvedValue(true),
    };
    const useCase = new UnregisterDeviceUseCase(prisma as any, devices as any, refreshTokens as any);
    return { tx, prisma, devices, refreshTokens, useCase };
  }

  it('deletes only the registration owned by the still-live caller session', async () => {
    const { tx, prisma, devices, refreshTokens, useCase } = setup();

    await expect(useCase.execute('user-1', 'session-2', 'fcm-token')).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalledWith(tx, 'user-1');
    expect(refreshTokens.lockLiveSession).toHaveBeenCalledWith(tx, 'user-1', 'session-2');
    expect(devices.deleteOwnedToken).toHaveBeenCalledWith(tx, 'user-1', 'session-2', 'fcm-token');
  });

  it('does not let an old access token unregister a token after its session ended', async () => {
    const { devices, refreshTokens, useCase } = setup();
    refreshTokens.lockLiveSession.mockResolvedValue(false);

    await expect(useCase.execute('user-1', 'revoked-session', 'fcm-token')).resolves.toBeUndefined();

    expect(devices.deleteOwnedToken).not.toHaveBeenCalled();
  });

  it('requires a session claim on legacy access tokens', async () => {
    const { prisma, devices, useCase } = setup();

    await expect(useCase.execute('user-1', undefined, 'fcm-token')).rejects.toMatchObject({
      httpStatus: 401,
      code: 'SESSION_REFRESH_REQUIRED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(devices.deleteOwnedToken).not.toHaveBeenCalled();
  });
});
