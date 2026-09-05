import { ResetPasswordUseCase } from './reset-password.use-case';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
}));

function buildTx() {
  return {} as any;
}

describe('ResetPasswordUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const otpRequest = {
    id: 'request-1',
    phone: '+201001234567',
    code_hash: 'hashed',
    purpose: 'PASSWORD_RESET',
    attempts: 0,
    consumed_at: null,
    verified_at: null,
    expires_at: new Date(now.getTime() + 60_000),
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const otpRequests = { findById: jest.fn(), incrementAttempts: jest.fn(), markConsumed: jest.fn() };
    const users = { findByPhone: jest.fn(), setPassword: jest.fn() };
    const refreshTokens = { revokeAllActiveForUser: jest.fn() };
    const useCase = new ResetPasswordUseCase(prisma as any, otpRequests as any, users as any, refreshTokens as any);
    return { tx, prisma, otpRequests, users, refreshTokens, useCase };
  }

  it('400s INVALID_CODE when the requestId does not exist', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(null);

    await expect(useCase.execute({ requestId: 'missing', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('400s INVALID_CODE when the request was already consumed — same as not-found, never reveals which', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, consumed_at: now });

    await expect(useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('400s INVALID_CODE when the request was created for a different purpose', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, purpose: 'LOGIN_OR_SIGNUP' });

    await expect(useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('410s CODE_EXPIRED once past expires_at, before checking the code', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, expires_at: new Date(now.getTime() - 1) });

    await expect(useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
      httpStatus: 410,
    });
  });

  it('rejects a valid request until the OTP verification endpoint marks it verified', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);

    await expect(useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('400s INVALID_CODE if the phone tied to the OTP request has no user (never happens for PASSWORD_RESET, but not a 500)', async () => {
    const { otpRequests, users, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    users.findByPhone.mockResolvedValue(null);

    await expect(useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('on a correct code: consumes the OTP, hashes and sets the new password, and revokes every existing refresh token for the user — all in one transaction', async () => {
    const { tx, otpRequests, users, refreshTokens, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, verified_at: now });
    const existingUser = { id: 'user-1', phone: otpRequest.phone };
    users.findByPhone.mockResolvedValue(existingUser);

    const result = await useCase.execute({ requestId: 'request-1', newPassword: 'NewPass1!' });

    expect(result).toBeUndefined();
    expect(otpRequests.markConsumed).toHaveBeenCalledWith(tx, 'request-1');
    expect(users.setPassword).toHaveBeenCalledWith(tx, 'user-1', 'hashed:NewPass1!');

    // The load-bearing assertion for this flow: a successful reset must
    // invalidate every existing session for the user, not just leave old
    // refresh tokens usable alongside the new password.
    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith(tx, 'user-1');
  });
});
