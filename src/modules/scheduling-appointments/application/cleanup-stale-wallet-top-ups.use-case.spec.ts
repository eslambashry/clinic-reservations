import { CleanupStaleWalletTopUpsUseCase } from './cleanup-stale-wallet-top-ups.use-case';

describe('CleanupStaleWalletTopUpsUseCase', () => {
  const tx = {} as any;
  const items = [{ paymentIntentId: 'pi1' }, { paymentIntentId: 'pi2' }];

  function setup(outcomes: string[], expireResults: boolean[] = [true, true]) {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const findStale = { execute: jest.fn().mockResolvedValue(items) };
    const reconcile = { reconcileOne: jest.fn() };
    outcomes.forEach((o) => reconcile.reconcileOne.mockResolvedValueOnce(o));
    const expire = { execute: jest.fn() };
    expireResults.forEach((r) => expire.execute.mockResolvedValueOnce(r));
    return { prisma, findStale, reconcile, expire, uc: new CleanupStaleWalletTopUpsUseCase(prisma as any, findStale as any, reconcile as any, expire as any) };
  }

  it('looks only for WALLET_TOPUP intents older than 24h and expires them after reconciling', async () => {
    const now = new Date('2026-11-22T12:00:00Z');
    const { uc, findStale, reconcile, expire } = setup(['FAILED', 'NOT_FOUND']);
    const result = await uc.execute(now);
    const arg = findStale.execute.mock.calls[0][0];
    expect(arg.payableTypes).toEqual(['WALLET_TOPUP']);
    expect(arg.olderThan.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    expect(reconcile.reconcileOne).toHaveBeenCalledTimes(2);
    expect(expire.execute).toHaveBeenCalledWith(tx, 'pi1');
    expect(result).toEqual({ checked: 2, expired: 2 });
  });

  it('does not expire when the gateway could not be queried (ERROR)', async () => {
    const { uc, expire } = setup(['ERROR', 'PENDING'], [true]);
    expect(await uc.execute()).toEqual({ checked: 2, expired: 1 });
    expect(expire.execute).toHaveBeenCalledTimes(1);
    expect(expire.execute).toHaveBeenCalledWith(tx, 'pi2');
  });

  it('does not count an intent that was captured meanwhile (expire returns false)', async () => {
    const { uc } = setup(['PAID', 'PAID'], [false, false]);
    expect(await uc.execute()).toEqual({ checked: 2, expired: 0 });
  });

  it('continues after an expire failure', async () => {
    const { uc, expire } = setup(['FAILED', 'FAILED']);
    expire.execute.mockReset();
    expire.execute.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(true);
    jest.spyOn((uc as any).logger, 'warn').mockImplementation();
    expect(await uc.execute()).toEqual({ checked: 2, expired: 1 });
  });
});
