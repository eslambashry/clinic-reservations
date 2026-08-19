import { OTP_CONSTANTS } from '../domain/otp.constants';
import { verifyOtpCode } from '../domain/otp-code.util';
import { VerifyOtpUseCase } from './verify-otp.use-case';

jest.mock('../domain/otp-code.util', () => ({
  verifyOtpCode: jest.fn(),
}));

const verifyOtpCodeMock = verifyOtpCode as jest.Mock;

function buildTx() {
  return {} as any;
}

describe('VerifyOtpUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const otpRequest = {
    id: 'request-1',
    phone: '+201001234567',
    code_hash: 'hashed',
    attempts: 0,
    consumed_at: null,
    expires_at: new Date(now.getTime() + 60_000),
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    verifyOtpCodeMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const otpRequests = { findById: jest.fn(), incrementAttempts: jest.fn(), markConsumed: jest.fn() };
    const users = { findByPhone: jest.fn(), create: jest.fn() };
    const roleMemberships = { findActiveByUser: jest.fn(), create: jest.fn() };
    const tokens = { issue: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new VerifyOtpUseCase(prisma as any, otpRequests as any, users as any, roleMemberships as any, tokens as any, outbox as any);
    return { tx, prisma, otpRequests, users, roleMemberships, tokens, outbox, useCase };
  }

  it('400s INVALID_CODE when the requestId does not exist', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(null);

    await expect(useCase.execute({ requestId: 'missing', code: '123456' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('400s INVALID_CODE when the request was already consumed — same as not-found, never reveals which', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, consumed_at: now });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
  });

  it('410s CODE_EXPIRED once past expires_at, before checking the code', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, expires_at: new Date(now.getTime() - 1) });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({ code: 'CODE_EXPIRED', httpStatus: 410 });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('423s TOO_MANY_ATTEMPTS once the stored attempts counter is already at the max, before checking the code', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS', httpStatus: 423 });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('on a wrong code, persists the incremented attempt count and 400s INVALID_CODE — the increment must survive even though this call throws', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    otpRequests.incrementAttempts.mockResolvedValue({ ...otpRequest, attempts: 1 });
    verifyOtpCodeMock.mockResolvedValue(false);

    await expect(useCase.execute({ requestId: 'request-1', code: '000000' })).rejects.toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });

    expect(otpRequests.incrementAttempts).toHaveBeenCalledWith(expect.anything(), 'request-1');
  });

  it('locks out with TOO_MANY_ATTEMPTS on the wrong-code attempt that pushes the counter to the max', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS - 1 });
    otpRequests.incrementAttempts.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS });
    verifyOtpCodeMock.mockResolvedValue(false);

    await expect(useCase.execute({ requestId: 'request-1', code: '000000' })).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS', httpStatus: 423 });
  });

  it('on a correct code for an existing user: consumes the OTP, reuses the existing PATIENT membership, issues tokens, and emits UserLoggedIn — all in one transaction', async () => {
    const { tx, otpRequests, users, roleMemberships, tokens, outbox, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    verifyOtpCodeMock.mockResolvedValue(true);
    const existingUser = { id: 'user-1', phone: otpRequest.phone };
    users.findByPhone.mockResolvedValue(existingUser);
    const membership = { id: 'membership-1', user_id: 'user-1', role_code: 'PATIENT', context_type: 'PATIENT' };
    roleMemberships.findActiveByUser.mockResolvedValue([membership]);
    tokens.issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800 });

    const result = await useCase.execute({ requestId: 'request-1', code: '123456' });

    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800, userId: 'user-1', isNewUser: false });
    expect(otpRequests.markConsumed).toHaveBeenCalledWith(tx, 'request-1');
    expect(users.create).not.toHaveBeenCalled();
    expect(roleMemberships.create).not.toHaveBeenCalled();
    expect(tokens.issue).toHaveBeenCalledWith(tx, membership);
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'UserLoggedIn', { userId: 'user-1', phone: otpRequest.phone });
  });

  it('on a correct code for a brand-new phone number: creates the User, provisions a PATIENT membership, and emits UserRegistered', async () => {
    const { tx, otpRequests, users, roleMemberships, tokens, outbox, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    verifyOtpCodeMock.mockResolvedValue(true);
    users.findByPhone.mockResolvedValue(null);
    const newUser = { id: 'user-2', phone: otpRequest.phone };
    users.create.mockResolvedValue(newUser);
    roleMemberships.findActiveByUser.mockResolvedValue([]);
    const membership = { id: 'membership-2', user_id: 'user-2', role_code: 'PATIENT', context_type: 'PATIENT' };
    roleMemberships.create.mockResolvedValue(membership);
    tokens.issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 1800 });

    const result = await useCase.execute({ requestId: 'request-1', code: '123456' });

    expect(result.isNewUser).toBe(true);
    expect(users.create).toHaveBeenCalledWith(tx, otpRequest.phone);
    expect(roleMemberships.create).toHaveBeenCalledWith(tx, { userId: 'user-2', roleCode: 'PATIENT', contextType: 'PATIENT' });
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'UserRegistered', { userId: 'user-2', phone: otpRequest.phone });
  });
});
