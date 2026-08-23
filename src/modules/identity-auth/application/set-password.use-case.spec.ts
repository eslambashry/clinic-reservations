import { SetPasswordUseCase } from './set-password.use-case';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
}));

describe('SetPasswordUseCase', () => {
  function setup() {
    const prisma = {};
    const users = { setPassword: jest.fn() };
    const useCase = new SetPasswordUseCase(prisma as any, users as any);
    return { prisma, users, useCase };
  }

  it('hashes the password and persists it via UserRepository.setPassword', async () => {
    const { prisma, users, useCase } = setup();

    const result = await useCase.execute({ userId: 'user-1', password: 'NewPass1!' });

    expect(result).toBeUndefined();
    expect(users.setPassword).toHaveBeenCalledWith(prisma, 'user-1', 'hashed:NewPass1!');
  });
});
