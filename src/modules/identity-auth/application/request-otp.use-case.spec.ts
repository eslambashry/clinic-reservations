import { OTP_CONSTANTS } from '../domain/otp.constants';
import { generateOtpCode, hashOtpCode } from '../domain/otp-code.util';
import { RequestOtpUseCase } from './request-otp.use-case';

jest.mock('../domain/otp-code.util', () => ({
  generateOtpCode: jest.fn(() => '123456'),
  hashOtpCode: jest.fn(async (code: string) => `hashed:${code}`),
}));

describe('RequestOtpUseCase', () => {
  function setup() {
    const prisma = {};
    const otpRequests = { create: jest.fn() };
    const rateLimiter = { consume: jest.fn() };
    const otpSender = { send: jest.fn() };
    const useCase = new RequestOtpUseCase(prisma as any, otpRequests as any, rateLimiter as any, otpSender as any);
    return { prisma, otpRequests, rateLimiter, otpSender, useCase };
  }

  it('429s RATE_LIMITED once the per-phone window is exhausted, without generating or sending a code', async () => {
    const { rateLimiter, otpSender, useCase } = setup();
    rateLimiter.consume.mockResolvedValue(false);

    await expect(useCase.execute({ phone: '+201001234567' })).rejects.toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
    expect(otpSender.send).not.toHaveBeenCalled();
  });

  it('generates a code, hashes it before persisting, sends the raw code, and never returns the code itself', async () => {
    const { prisma, otpRequests, rateLimiter, otpSender, useCase } = setup();
    rateLimiter.consume.mockResolvedValue(true);
    otpRequests.create.mockResolvedValue({ id: 'request-1' });

    const result = await useCase.execute({ phone: '+201001234567', ip: '203.0.113.1' });

    expect(result).toEqual({ requestId: 'request-1', expiresInSeconds: OTP_CONSTANTS.EXPIRES_IN_SECONDS });
    expect(generateOtpCode).toHaveBeenCalled();
    expect(hashOtpCode).toHaveBeenCalledWith('123456');
    expect(otpRequests.create).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ phone: '+201001234567', codeHash: 'hashed:123456' }),
    );
    expect(otpSender.send).toHaveBeenCalledWith('+201001234567', '123456');
    expect(result).not.toHaveProperty('code');
  });
});
