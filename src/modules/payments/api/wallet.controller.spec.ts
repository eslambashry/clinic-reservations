import { WalletController } from './wallet.controller';

describe('WalletController', () => {
  const user = { sub: 'u1' } as any;
  const get = { execute: jest.fn().mockResolvedValue('w') };
  const topUp = { execute: jest.fn().mockResolvedValue('t') };
  const list = { execute: jest.fn().mockResolvedValue('l') };
  const requestWithdrawal = { execute: jest.fn().mockResolvedValue('wd') };
  const myWithdrawals = { list: jest.fn().mockResolvedValue('wl'), cancel: jest.fn().mockResolvedValue('wc') };
  const controller = new WalletController(get as any, topUp as any, list as any, requestWithdrawal as any, myWithdrawals as any);

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

  it('createWithdrawal maps the dto and the caller id', async () => {
    const dto = { amount: '50.00', accountHolderName: 'Mona Ali', payoutMethod: 'IBAN', payoutAccount: 'EG38' } as any;
    await expect(controller.createWithdrawal(dto, user)).resolves.toBe('wd');
    expect(requestWithdrawal.execute).toHaveBeenCalledWith({ userId: 'u1', ...dto });
  });

  it('listWithdrawals and cancelWithdrawal are scoped to the caller', async () => {
    await expect(controller.listWithdrawals(user)).resolves.toBe('wl');
    expect(myWithdrawals.list).toHaveBeenCalledWith('u1');
    await expect(controller.cancelWithdrawal('w-1', user)).resolves.toBe('wc');
    expect(myWithdrawals.cancel).toHaveBeenCalledWith('u1', 'w-1');
  });
});
