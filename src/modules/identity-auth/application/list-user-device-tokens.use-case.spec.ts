import { ListUserDeviceTokensUseCase } from './list-user-device-tokens.use-case';

describe('ListUserDeviceTokensUseCase', () => {
  const prisma: any = {};
  const devices = { listTokensForUser: jest.fn().mockResolvedValue([]) };
  const useCase = new ListUserDeviceTokensUseCase(prisma, devices as any);

  it('uses prisma by default and tx when given', async () => {
    await useCase.execute('u');
    expect(devices.listTokensForUser).toHaveBeenLastCalledWith(prisma, 'u');
    const tx: any = {};
    await useCase.execute('u', tx);
    expect(devices.listTokensForUser).toHaveBeenLastCalledWith(tx, 'u');
  });
});
