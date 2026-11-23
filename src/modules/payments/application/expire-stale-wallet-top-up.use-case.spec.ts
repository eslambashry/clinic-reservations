import { ExpireStaleWalletTopUpUseCase } from './expire-stale-wallet-top-up.use-case';

describe('ExpireStaleWalletTopUpUseCase', () => {
  const tx = {} as any;
  function setup(intent: any, cancelled = true, attempt: any = { id: 'a1', status: 'INITIATED' }) {
    const intents = { findById: jest.fn().mockResolvedValue(intent), markCancelled: jest.fn().mockResolvedValue(cancelled) };
    const attempts = { findLatestByPaymentIntentId: jest.fn().mockResolvedValue(attempt), updateStatus: jest.fn() };
    const walletTx = { findByPaymentIntentId: jest.fn().mockResolvedValue({ id: 'wt1' }), markFailed: jest.fn() };
    return { intents, attempts, walletTx, uc: new ExpireStaleWalletTopUpUseCase(intents as any, attempts as any, walletTx as any) };
  }
  const intent = { id: 'pi1', payable_type: 'WALLET_TOPUP', status: 'CREATED', version: 3 };

  it('cancels intent, fails the wallet transaction and the attempt', async () => {
    const { uc, intents, walletTx, attempts } = setup(intent);
    await expect(uc.execute(tx, 'pi1')).resolves.toBe(true);
    expect(intents.markCancelled).toHaveBeenCalledWith(tx, 'pi1', 3);
    expect(walletTx.markFailed).toHaveBeenCalledWith(tx, 'wt1', 'EXPIRED_ABANDONED');
    expect(attempts.updateStatus).toHaveBeenCalledWith(tx, 'a1', 'FAILED', { failureCode: 'EXPIRED_ABANDONED' });
  });

  it('does not touch an already-resolved attempt', async () => {
    const { uc, attempts } = setup(intent, true, { id: 'a1', status: 'FAILED' });
    await uc.execute(tx, 'pi1');
    expect(attempts.updateStatus).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...intent, status: 'CAPTURED' }, true],
    [{ ...intent, payable_type: 'APPOINTMENT' }, true],
    [null, true],
    [intent, false],
  ])('is a no-op when not expirable (%#)', async (i, cancelled) => {
    const { uc, walletTx } = setup(i, cancelled as boolean);
    await expect(uc.execute(tx, 'pi1')).resolves.toBe(false);
    expect(walletTx.markFailed).not.toHaveBeenCalled();
  });
});
