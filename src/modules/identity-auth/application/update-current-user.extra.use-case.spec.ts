import { UpdateCurrentUserUseCase } from './update-current-user.use-case';

describe('UpdateCurrentUserUseCase (name handling)', () => {
  const base = { userId: 'u1', activeRoleCode: 'PATIENT' };

  function setup(current: { email: string | null } | null = { email: null }) {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue(current) } };
    const prisma = { $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)) };
    const updateUserProfile = { execute: jest.fn().mockResolvedValue(undefined) };
    const getCurrentUser = { execute: jest.fn().mockResolvedValue({ id: 'u1' }) };
    return { prisma, tx, updateUserProfile, getCurrentUser, useCase: new UpdateCurrentUserUseCase(prisma as any, updateUserProfile as any, getCurrentUser as any) };
  }

  it('skips the transaction when nothing is supplied', async () => {
    const { prisma, getCurrentUser, useCase } = setup();
    expect(await useCase.execute(base)).toEqual({ id: 'u1' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(getCurrentUser.execute).toHaveBeenCalledWith({ userId: 'u1', activeRoleCode: 'PATIENT' });
  });

  it('splits a multi-word display name into first and last name', async () => {
    const { tx, updateUserProfile, useCase } = setup();
    await useCase.execute({ ...base, displayName: '  Sara  Ali  Hassan ' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(tx, { userId: 'u1', firstName: 'Sara', lastName: 'Ali Hassan', email: undefined });
  });

  it('single-word display name yields no last name', async () => {
    const { tx, updateUserProfile, useCase } = setup();
    await useCase.execute({ ...base, displayName: 'Sara' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(tx, { userId: 'u1', firstName: 'Sara', lastName: undefined, email: undefined });
  });

  it('email-only update leaves names undefined and tolerates a missing user row', async () => {
    const { tx, updateUserProfile, useCase } = setup(null);
    await useCase.execute({ ...base, email: 'a@b.c' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(tx, { userId: 'u1', firstName: undefined, lastName: undefined, email: 'a@b.c' });
  });

  it('display-name-only update with an existing email does not run the email guard', async () => {
    const { updateUserProfile, useCase } = setup({ email: 'x@y.z' });
    await useCase.execute({ ...base, displayName: 'Sara' });
    expect(updateUserProfile.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ firstName: 'Sara', email: undefined }));
  });
});
