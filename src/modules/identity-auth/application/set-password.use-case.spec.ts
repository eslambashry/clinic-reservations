import { SetPasswordUseCase } from './set-password.use-case';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
}));

describe('SetPasswordUseCase', () => {
  function setup() {
    const tx = {};
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const users = { setPassword: jest.fn() };
    const useCase = new SetPasswordUseCase(prisma as any, users as any);
    return { prisma, tx, users, useCase };
  }

  it('hashes the password and persists it via UserRepository.setPassword', async () => {
    const { prisma, tx, users, useCase } = setup();

    const result = await useCase.execute({ userId: 'user-1', password: 'NewPass1!' });

    expect(result).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(users.setPassword).toHaveBeenCalledWith(tx, 'user-1', 'hashed:NewPass1!');
  });
});
