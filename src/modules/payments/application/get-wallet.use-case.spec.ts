import { Prisma } from '@prisma/client';
import { GetWalletUseCase } from './get-wallet.use-case';

describe('GetWalletUseCase', () => {
  const prisma = { db: true } as any;

  it('returns the wallet balance formatted to two decimals', async () => {
    const wallets = { findByUserId: jest.fn().mockResolvedValue({ id: 'w1', balance: new Prisma.Decimal('12.5'), currency: 'EGP' }) };
    const result = await new GetWalletUseCase(prisma, wallets as any).execute('u1');
    expect(wallets.findByUserId).toHaveBeenCalledWith(prisma, 'u1');
    expect(result).toEqual({ walletId: 'w1', balance: '12.50', currency: 'EGP' });
  });

  it('returns an empty zero wallet when none exists yet', async () => {
    const wallets = { findByUserId: jest.fn().mockResolvedValue(null) };
    await expect(new GetWalletUseCase(prisma, wallets as any).execute('u1')).resolves.toEqual({
      walletId: '',
      balance: '0.00',
      currency: 'EGP',
    });
  });
});
