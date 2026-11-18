import { GetUserContactInfoUseCase } from './get-user-contact-info.use-case';

describe('GetUserContactInfoUseCase', () => {
  const prisma: any = {};
  const users = { findById: jest.fn() };
  const useCase = new GetUserContactInfoUseCase(prisma, users as any);

  it('returns the unmasked phone', async () => {
    users.findById.mockResolvedValue({ phone: '+201000' });
    expect(await useCase.execute('u')).toEqual({ phone: '+201000' });
    expect(users.findById).toHaveBeenCalledWith(prisma, 'u');
  });

  it('returns null for unknown user', async () => {
    users.findById.mockResolvedValue(null);
    expect(await useCase.execute('u')).toBeNull();
  });
});
