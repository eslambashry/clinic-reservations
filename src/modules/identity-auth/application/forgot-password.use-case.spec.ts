import { ForgotPasswordUseCase } from './forgot-password.use-case';

describe('ForgotPasswordUseCase', () => {
  function setup() {
    const requestOtp = { execute: jest.fn() };
    const useCase = new ForgotPasswordUseCase(requestOtp as any);
    return { requestOtp, useCase };
  }

  it('delegates to RequestOtpUseCase with the PASSWORD_RESET purpose, passing phone and ip through unchanged', async () => {
    const { requestOtp, useCase } = setup();
    requestOtp.execute.mockResolvedValue({ requestId: 'request-1', expiresInSeconds: 300 });

    const result = await useCase.execute({ phone: '+201001234567', ip: '203.0.113.1' });

    expect(result).toEqual({ requestId: 'request-1', expiresInSeconds: 300 });
    expect(requestOtp.execute).toHaveBeenCalledWith({
      phone: '+201001234567',
      ip: '203.0.113.1',
      purpose: 'PASSWORD_RESET',
    });
  });

  it('propagates RequestOtpUseCase failures (e.g. rate limiting) as-is', async () => {
    const { requestOtp, useCase } = setup();
    const error = Object.assign(new Error('rate limited'), { code: 'RATE_LIMITED', httpStatus: 429 });
    requestOtp.execute.mockRejectedValue(error);

    await expect(useCase.execute({ phone: '+201001234567' })).rejects.toBe(error);
  });
});
