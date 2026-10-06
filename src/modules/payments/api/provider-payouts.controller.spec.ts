import { ProviderType } from '@prisma/client';
import { ProviderPayoutsController } from './provider-payouts.controller';

describe('ProviderPayoutsController', () => {
  const balance = { execute: jest.fn().mockResolvedValue('bal') };
  const payout = { execute: jest.fn().mockResolvedValue('paid') };
  const controller = new ProviderPayoutsController(balance as any, payout as any);
  const type = Object.values(ProviderType)[0] as ProviderType;

  it('getOutstandingBalance delegates', async () => {
    await expect(controller.getOutstandingBalance(type, 'p1')).resolves.toBe('bal');
    expect(balance.execute).toHaveBeenCalledWith(type, 'p1');
  });

  it('recordPayoutRoute maps the dto', async () => {
    const user = { sub: 'admin' } as any;
    await expect(controller.recordPayoutRoute(type, 'p1', { amount: 100, note: 'n' } as any, user)).resolves.toBe('paid');
    expect(payout.execute).toHaveBeenCalledWith({ providerType: type, providerId: 'p1', amount: 100, note: 'n' }, user);
  });
});
