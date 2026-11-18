import { Prisma } from '@prisma/client';
import { UpdateUserProfileUseCase } from './update-user-profile.use-case';

describe('UpdateUserProfileUseCase', () => {
  const users = { updateProfile: jest.fn() };
  const useCase = new UpdateUserProfileUseCase(users as any);
  const tx: any = {};
  const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
  beforeEach(() => jest.resetAllMocks());

  it('is a no-op when nothing to update', async () => {
    await useCase.execute(tx, { userId: 'u' });
    expect(users.updateProfile).not.toHaveBeenCalled();
  });

  it('updates the provided fields', async () => {
    await useCase.execute(tx, { userId: 'u', firstName: 'a', email: 'e' });
    expect(users.updateProfile).toHaveBeenCalledWith(tx, 'u', { firstName: 'a', email: 'e' });
  });

  it('on email conflict retries without email when names exist', async () => {
    users.updateProfile.mockRejectedValueOnce(p2002()).mockResolvedValueOnce(undefined);
    await useCase.execute(tx, { userId: 'u', firstName: 'a', email: 'e' });
    expect(users.updateProfile).toHaveBeenLastCalledWith(tx, 'u', { firstName: 'a' });
  });

  it('on email-only conflict swallows without retry', async () => {
    users.updateProfile.mockRejectedValueOnce(p2002());
    await expect(useCase.execute(tx, { userId: 'u', email: 'e' })).resolves.toBeUndefined();
    expect(users.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('rethrows P2002 when no email was being set', async () => {
    const err = p2002();
    users.updateProfile.mockRejectedValueOnce(err);
    await expect(useCase.execute(tx, { userId: 'u', firstName: 'a' })).rejects.toBe(err);
  });

  it('rethrows other errors', async () => {
    const err = new Error('boom');
    users.updateProfile.mockRejectedValueOnce(err);
    await expect(useCase.execute(tx, { userId: 'u', email: 'e' })).rejects.toBe(err);
  });
});
