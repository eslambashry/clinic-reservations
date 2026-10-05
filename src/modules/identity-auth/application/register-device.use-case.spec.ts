import { RegisterDeviceUseCase } from './register-device.use-case';

describe('RegisterDeviceUseCase', () => {
  const input = { userId: 'user-1', sessionId: 'session-1', fcmToken: 'fcm-1', platform: 'web' };

  function setup() {
    const tx = { tx: true };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const devices = { upsertByToken: jest.fn().mockResolvedValue({ id: 'device-1' }), detachRefreshTokensOnTransfer: jest.fn() };
    const refreshTokens = { lockUserForAuthMutation: jest.fn(), lockLiveSession: jest.fn().mockResolvedValue(true) };
    const useCase = new RegisterDeviceUseCase(prisma as any, devices as any, refreshTokens as any);
    return { tx, prisma, devices, refreshTokens, useCase };
  }

  it('locks the live session and upserts the token bound to that session in the same transaction', async () => {
    const { tx, devices, refreshTokens, useCase } = setup();
    const order: string[] = [];
    refreshTokens.lockLiveSession.mockImplementation(async () => { order.push('lock'); return true; });
    devices.upsertByToken.mockImplementation(async () => { order.push('upsert'); return { id: 'device-1' }; });

    await expect(useCase.execute(input)).resolves.toEqual({ deviceId: 'device-1' });

    expect(refreshTokens.lockLiveSession).toHaveBeenCalledWith(tx, 'user-1', 'session-1');
    expect(refreshTokens.lockUserForAuthMutation).toHaveBeenCalledWith(tx, 'user-1');
    expect(devices.upsertByToken).toHaveBeenCalledWith(tx, input);
    expect(devices.detachRefreshTokensOnTransfer).toHaveBeenCalledWith(tx, 'device-1', 'user-1', 'session-1');
    expect(order).toEqual(['lock', 'upsert']);
  });

  it('409s without writing when the session already ended (late request after logout) — never 401, which would make clients refresh with a revoked token', async () => {
    const { devices, refreshTokens, useCase } = setup();
    refreshTokens.lockLiveSession.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toMatchObject({ httpStatus: 409, code: 'DEVICE_SESSION_ENDED' });
    expect(devices.upsertByToken).not.toHaveBeenCalled();
  });

  it('401s a legacy access token without a session claim so the client refreshes once', async () => {
    const { prisma, devices, useCase } = setup();

    await expect(useCase.execute({ ...input, sessionId: undefined })).rejects.toMatchObject({ httpStatus: 401, code: 'SESSION_REFRESH_REQUIRED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(devices.upsertByToken).not.toHaveBeenCalled();
  });
});
