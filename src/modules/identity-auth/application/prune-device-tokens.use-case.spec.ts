import { PruneDeviceTokensUseCase } from './prune-device-tokens.use-case';

describe('PruneDeviceTokensUseCase', () => {
  const prisma: any = { p: 1 };
  const devices = { deleteTokensForOwnerSnapshot: jest.fn() };
  const useCase = new PruneDeviceTokensUseCase(prisma, devices as any);
  const regs = [{ id: 'd', fcmToken: 't', sessionId: null, version: 1 }];
  beforeEach(() => jest.resetAllMocks());

  it('returns 0 without hitting the repo for an empty list', async () => {
    expect(await useCase.execute('u', [])).toBe(0);
    expect(devices.deleteTokensForOwnerSnapshot).not.toHaveBeenCalled();
  });

  it('uses prisma by default', async () => {
    devices.deleteTokensForOwnerSnapshot.mockResolvedValue({ count: 1 });
    expect(await useCase.execute('u', regs)).toBe(1);
    expect(devices.deleteTokensForOwnerSnapshot).toHaveBeenCalledWith(prisma, 'u', regs);
  });

  it('uses the supplied tx', async () => {
    const tx: any = {};
    devices.deleteTokensForOwnerSnapshot.mockResolvedValue({ count: 2 });
    expect(await useCase.execute('u', regs, tx)).toBe(2);
    expect(devices.deleteTokensForOwnerSnapshot).toHaveBeenCalledWith(tx, 'u', regs);
  });
});
