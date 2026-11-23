import { Prisma } from '@prisma/client';
import { GetWalletUseCase } from './get-wallet.use-case';

describe('GetWalletUseCase', () => {
  const prisma = { db: true } as any;
  const serviceFee = { get: jest.fn().mockResolvedValue({ amount: '12.00', currency: 'EGP' }) };
  const limits = {
    serviceFee: '12.00',
    minWithdrawal: '12.00',
    topUpMin: '12.00',
    topUpMaxPerOperation: '5000.00',
    topUpMaxDaily: '10000.00',
  };

  it('returns the wallet balance formatted to two decimals plus the fee-derived limits', async () => {
    const wallets = { findByUserId: jest.fn().mockResolvedValue({ id: 'w1', balance: new Prisma.Decimal('12.5'), currency: 'EGP' }) };
    const result = await new GetWalletUseCase(prisma, wallets as any, serviceFee as any).execute('u1');
    expect(wallets.findByUserId).toHaveBeenCalledWith(prisma, 'u1');
    expect(result).toEqual({ walletId: 'w1', balance: '12.50', currency: 'EGP', ...limits });
  });

  it('returns an empty zero wallet when none exists yet', async () => {
    const wallets = { findByUserId: jest.fn().mockResolvedValue(null) };
    await expect(new GetWalletUseCase(prisma, wallets as any, serviceFee as any).execute('u1')).resolves.toEqual({
      walletId: '',
      balance: '0.00',
      currency: 'EGP',
      ...limits,
    });
  });
});
