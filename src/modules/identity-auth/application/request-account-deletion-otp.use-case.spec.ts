import { RequestAccountDeletionOtpUseCase } from './request-account-deletion-otp.use-case';

describe('RequestAccountDeletionOtpUseCase', () => {
  function setup(user: unknown) {
    const users = { findByPhone: jest.fn().mockResolvedValue(user) };
    const requestOtp = { execute: jest.fn().mockResolvedValue({ requestId: 'r1', expiresInSeconds: 300 }) };
    return { requestOtp, useCase: new RequestAccountDeletionOtpUseCase({} as any, users as any, requestOtp as any) };
  }

  it('sends an ACCOUNT_DELETION otp for an existing account', async () => {
    const { requestOtp, useCase } = setup({ id: 'u1', deleted_at: null });
    await expect(useCase.execute({ phone: '+201001234567', ip: '1.1.1.1' })).resolves.toEqual({
      requestId: 'r1',
      expiresInSeconds: 300,
    });
    expect(requestOtp.execute).toHaveBeenCalledWith({ phone: '+201001234567', ip: '1.1.1.1', purpose: 'ACCOUNT_DELETION' });
  });

  it.each([null, { id: 'u1', deleted_at: new Date() }])('sends nothing but returns a requestId for %p', async (user) => {
    const { requestOtp, useCase } = setup(user);
    const result = await useCase.execute({ phone: '+201001234567' });
    expect(requestOtp.execute).not.toHaveBeenCalled();
    expect(result.requestId).toEqual(expect.any(String));
  });
});
