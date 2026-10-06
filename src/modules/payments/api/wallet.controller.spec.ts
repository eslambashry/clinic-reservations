import { WalletController } from './wallet.controller';

describe('WalletController', () => {
  const user = { sub: 'u1' } as any;
  const get = { execute: jest.fn().mockResolvedValue('w') };
  const topUp = { execute: jest.fn().mockResolvedValue('t') };
  const list = { execute: jest.fn().mockResolvedValue('l') };
  const controller = new WalletController(get as any, topUp as any, list as any);

  it('get uses the caller id', async () => {
    await expect(controller.get(user)).resolves.toBe('w');
    expect(get.execute).toHaveBeenCalledWith('u1');
  });

  it('topUp maps dto', async () => {
    await expect(controller.topUp({ amount: 50, customer: { name: 'a' } } as any, user)).resolves.toBe('t');
    expect(topUp.execute).toHaveBeenCalledWith({ userId: 'u1', amount: 50, customer: { name: 'a' } });
  });

  it('listWalletTransactions uses provided limit', async () => {
    await controller.listWalletTransactions({ cursor: 'c', limit: 5 } as any, user);
    expect(list.execute).toHaveBeenCalledWith({ userId: 'u1', cursor: 'c', limit: 5 });
  });

  it('listWalletTransactions defaults limit to 20', async () => {
    await controller.listWalletTransactions({} as any, user);
    expect(list.execute).toHaveBeenLastCalledWith({ userId: 'u1', cursor: undefined, limit: 20 });
  });
});
