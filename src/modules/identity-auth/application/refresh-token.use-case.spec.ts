import { hashRefreshToken } from '../domain/refresh-token.util';
import { RefreshTokenUseCase } from './refresh-token.use-case';

jest.mock('../domain/refresh-token.util', () => ({
  hashRefreshToken: jest.fn((token: string) => `hashed:${token}`),
}));

function buildTx() {
  return {} as any;
}

describe('RefreshTokenUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const rawToken = 'raw-refresh-token';
  const storedToken = {
    id: 'token-1',
    user_id: 'user-1',
    token_hash: `hashed:${rawToken}`,
    device_id: null,
    revoked_at: null as Date | null,
    expires_at: new Date(now.getTime() + 60_000),
  };
  const membership = { id: 'membership-1', user_id: 'user-1', role_code: 'PATIENT', context_type: 'PATIENT' };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const refreshTokens = { findByTokenHash: jest.fn(), revokeAllActiveForUser: jest.fn(), revoke: jest.fn() };
    const roleMemberships = { findActiveByUser: jest.fn() };
    const tokens = { rotate: jest.fn() };
    const useCase = new RefreshTokenUseCase(prisma as any, refreshTokens as any, roleMemberships as any, tokens as any);
    return { tx, prisma, refreshTokens, roleMemberships, tokens, useCase };
  }

  it('rejects an unrecognized token hash', async () => {
    const { refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', httpStatus: 401 });
    expect(hashRefreshToken).toHaveBeenCalledWith(rawToken);
  });

  it('treats replay of an already-rotated token as a theft signal: revokes every active token for the user and 401s TOKEN_FAMILY_REVOKED', async () => {
    const { refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue({ ...storedToken, revoked_at: now });

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toMatchObject({ code: 'TOKEN_FAMILY_REVOKED', httpStatus: 401 });
    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('rejects an expired-but-not-revoked token', async () => {
    const { refreshTokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue({ ...storedToken, expires_at: new Date(now.getTime() - 1) });

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', httpStatus: 401 });
  });

  it('rejects when the revoke loses a concurrent-refresh race (two calls presenting the same still-valid token) instead of minting a second token pair', async () => {
    const { refreshTokens, tokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(storedToken);
    refreshTokens.revoke.mockResolvedValue(false);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', httpStatus: 401 });
    expect(tokens.rotate).not.toHaveBeenCalled();
  });

  it('rejects when the user has no active role membership left', async () => {
    const { refreshTokens, roleMemberships, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(storedToken);
    refreshTokens.revoke.mockResolvedValue(true);
    roleMemberships.findActiveByUser.mockResolvedValue([]);

    await expect(useCase.execute({ refreshToken: rawToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN', httpStatus: 401 });
  });

  it('rotates: revokes the presented token and issues a new pair chained to it, in one transaction', async () => {
    const { tx, refreshTokens, roleMemberships, tokens, useCase } = setup();
    refreshTokens.findByTokenHash.mockResolvedValue(storedToken);
    refreshTokens.revoke.mockResolvedValue(true);
    roleMemberships.findActiveByUser.mockResolvedValue([membership]);
    tokens.rotate.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 1800 });

    const result = await useCase.execute({ refreshToken: rawToken });

    expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 1800 });
    expect(refreshTokens.revoke).toHaveBeenCalledWith(tx, 'token-1');
    expect(tokens.rotate).toHaveBeenCalledWith(tx, membership, 'token-1', undefined);
  });
});
