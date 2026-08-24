import { OTP_CONSTANTS } from '../domain/otp.constants';
import { verifyOtpCode } from '../domain/otp-code.util';
import { VerifyResetCodeUseCase } from './verify-reset-code.use-case';

jest.mock('../domain/otp-code.util', () => ({
  verifyOtpCode: jest.fn(),
}));

const verifyOtpCodeMock = verifyOtpCode as jest.Mock;

describe('VerifyResetCodeUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const otpRequest = {
    id: 'request-1',
    phone: '+201001234567',
    code_hash: 'hashed',
    purpose: 'PASSWORD_RESET',
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
    const prisma = { $transaction: jest.fn() };
    const otpRequests = {
      findById: jest.fn(),
      incrementAttempts: jest.fn(),
      markConsumed: jest.fn(),
    };
    const useCase = new VerifyResetCodeUseCase(prisma as any, otpRequests as any);
    return { prisma, otpRequests, useCase };
  }

  it('400s INVALID_CODE when the requestId does not exist', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(null);

    await expect(useCase.execute({ requestId: 'missing', code: '123456' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('400s INVALID_CODE when the request was already consumed — same as not-found, never reveals which', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, consumed_at: now });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
  });

  it('400s INVALID_CODE when the request was created for a different purpose', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, purpose: 'LOGIN_OR_SIGNUP' });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('410s CODE_EXPIRED once past expires_at, before checking the code', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, expires_at: new Date(now.getTime() - 1) });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
      httpStatus: 410,
    });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('423s TOO_MANY_ATTEMPTS once the stored attempts counter is already at the max, before checking the code', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS });

    await expect(useCase.execute({ requestId: 'request-1', code: '123456' })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      httpStatus: 423,
    });
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it('on a wrong code, persists the incremented attempt count and 400s INVALID_CODE — the increment must survive even though this call throws', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    otpRequests.incrementAttempts.mockResolvedValue({ ...otpRequest, attempts: 1 });
    verifyOtpCodeMock.mockResolvedValue(false);

    await expect(useCase.execute({ requestId: 'request-1', code: '000000' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
      httpStatus: 400,
    });

    expect(otpRequests.incrementAttempts).toHaveBeenCalledWith(expect.anything(), 'request-1');
    expect(otpRequests.markConsumed).not.toHaveBeenCalled();
  });

  it('locks out with TOO_MANY_ATTEMPTS on the wrong-code attempt that pushes the counter to the max', async () => {
    const { otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS - 1 });
    otpRequests.incrementAttempts.mockResolvedValue({ ...otpRequest, attempts: OTP_CONSTANTS.MAX_VERIFY_ATTEMPTS });
    verifyOtpCodeMock.mockResolvedValue(false);

    await expect(useCase.execute({ requestId: 'request-1', code: '000000' })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      httpStatus: 423,
    });
  });

  it('on a correct code: reports valid without consuming the OTP, touching the transaction, or issuing any tokens/password change', async () => {
    const { prisma, otpRequests, useCase } = setup();
    otpRequests.findById.mockResolvedValue(otpRequest);
    verifyOtpCodeMock.mockResolvedValue(true);

    const result = await useCase.execute({ requestId: 'request-1', code: '123456' });

    expect(result).toEqual({ valid: true });

    // The load-bearing assertions for this endpoint: a check-only call must
    // never mark the OTP consumed, never touch password_hash (there's no
    // `users`/`setPassword` dependency at all — see the constructor), and
    // never open the success-path transaction that ResetPasswordUseCase uses.
    expect(otpRequests.markConsumed).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
