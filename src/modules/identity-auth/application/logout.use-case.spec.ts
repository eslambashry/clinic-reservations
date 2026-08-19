import { LogoutUseCase } from './logout.use-case';

jest.mock('../domain/refresh-token.util', () => ({
  hashRefreshToken: jest.fn((token: string) => `hashed:${token}`),
}));

describe('LogoutUseCase', () => {
  const rawToken = 'raw-refresh-token';
  const existing = { id: 'token-1', user_id: 'user-1', revoked_at: null as Date | null };

  function setup() {
    const prisma = {};
    const refreshTokens = { findByTokenHash: jest.fn(), revoke: jest.fn(), revokeAllActiveForUser: jest.fn() };
    const useCase = new LogoutUseCase(prisma as any, refreshTokens as any);
    return { prisma, refreshTokens, useCase };
  }

  it('is a no-op success for an unrecognized token — logout must never reveal whether a token value is valid', async () => {
    const { refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: rawToken })).resolves.toBeUndefined();
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });

  it('is a no-op for a token that is already revoked', async () => {
    const { refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue({ ...existing, revoked_at: new Date() });

    await useCase.execute({ refreshToken: rawToken });

    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });

  it('revokes only the presented token by default (single-device logout)', async () => {
    const { prisma, refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(existing);

    await useCase.execute({ refreshToken: rawToken });

    expect(refreshTokens.revoke).toHaveBeenCalledWith(prisma, 'token-1');
    expect(refreshTokens.revokeAllActiveForUser).not.toHaveBeenCalled();
  });

  it('revokes every active token for the user when allDevices is set', async () => {
    const { prisma, refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(existing);

    await useCase.execute({ refreshToken: rawToken, allDevices: true });

    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(prisma, 'user-1');
    expect(refreshTokens.revoke).not.toHaveBeenCalled();
  });
});
