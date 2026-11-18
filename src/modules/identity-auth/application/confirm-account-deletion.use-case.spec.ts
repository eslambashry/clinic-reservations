import { validateOtpCode } from '../domain/otp-verification.util';
import { ConfirmAccountDeletionUseCase } from './confirm-account-deletion.use-case';

jest.mock('../domain/otp-verification.util', () => ({ validateOtpCode: jest.fn() }));

describe('ConfirmAccountDeletionUseCase', () => {
  function setup(user: unknown) {
    const otpRequests = {
      findById: jest.fn().mockResolvedValue({ id: 'r1', phone: '+201001234567' }),
      incrementAttempts: jest.fn(),
      markConsumed: jest.fn(),
    };
    const users = { findByPhone: jest.fn().mockResolvedValue(user) };
    const deleteAccount = { execute: jest.fn().mockResolvedValue(undefined) };
    return {
      otpRequests,
      deleteAccount,
      useCase: new ConfirmAccountDeletionUseCase({} as any, otpRequests as any, users as any, deleteAccount as any),
    };
  }

  beforeEach(() => (validateOtpCode as jest.Mock).mockReset().mockResolvedValue(undefined));

  it('deletes the account then consumes the otp', async () => {
    const { otpRequests, deleteAccount, useCase } = setup({ id: 'u1', deleted_at: null });
    await useCase.execute({ requestId: 'r1', code: '123456' });
    expect(validateOtpCode).toHaveBeenCalledWith(
      expect.anything(),
      { code: '123456', purpose: 'ACCOUNT_DELETION' },
      expect.any(Function),
    );
    expect(deleteAccount.execute).toHaveBeenCalledWith('u1');
    expect(otpRequests.markConsumed).toHaveBeenCalled();
  });

  it('does not delete when the otp is invalid', async () => {
    const { deleteAccount, useCase } = setup({ id: 'u1', deleted_at: null });
    (validateOtpCode as jest.Mock).mockRejectedValue(new Error('INVALID_CODE'));
    await expect(useCase.execute({ requestId: 'r1', code: '000000' })).rejects.toThrow('INVALID_CODE');
    expect(deleteAccount.execute).not.toHaveBeenCalled();
  });

  it('rejects when the account is gone', async () => {
    await expect(setup(null).useCase.execute({ requestId: 'r1', code: '123456' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
    });
  });

  it('keeps the otp unconsumed when deletion is refused', async () => {
    const { otpRequests, deleteAccount, useCase } = setup({ id: 'u1', deleted_at: null });
    deleteAccount.execute.mockRejectedValue(new Error('ACCOUNT_HAS_OPEN_APPOINTMENTS'));
    await expect(useCase.execute({ requestId: 'r1', code: '123456' })).rejects.toThrow('ACCOUNT_HAS_OPEN_APPOINTMENTS');
    expect(otpRequests.markConsumed).not.toHaveBeenCalled();
  });
});
