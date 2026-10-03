import { UpdateCurrentUserUseCase } from './update-current-user.use-case';

describe('UpdateCurrentUserUseCase', () => {
  const input = { userId: 'user-1', activeRoleCode: 'PATIENT' };

  function setup(email: string | null) {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ email }) } };
    const prisma = { $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)) };
    const updateUserProfile = { execute: jest.fn().mockResolvedValue(undefined) };
    const getCurrentUser = { execute: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    return { tx, prisma, updateUserProfile, getCurrentUser, useCase: new UpdateCurrentUserUseCase(prisma as any, updateUserProfile as any, getCurrentUser as any) };
  }

  it('rejects an attempt to replace an existing email address', async () => {
    const { updateUserProfile, useCase } = setup('old@example.com');
    await expect(useCase.execute({ ...input, email: 'new@example.com' })).rejects.toMatchObject({ code: 'EMAIL_NOT_EDITABLE' });
    expect(updateUserProfile.execute).not.toHaveBeenCalled();
  });

  it('does not rewrite an existing email when the same address is sent', async () => {
    const { updateUserProfile, useCase } = setup('old@example.com');
    await useCase.execute({ ...input, email: 'OLD@example.com' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: undefined }));
  });

  it('allows onboarding to set an email only when the account has none', async () => {
    const { updateUserProfile, useCase } = setup(null);
    await useCase.execute({ ...input, email: 'first@example.com' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: 'first@example.com' }));
  });
});
