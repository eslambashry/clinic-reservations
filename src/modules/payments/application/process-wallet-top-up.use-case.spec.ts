import { ProcessWalletTopUpUseCase } from './process-wallet-top-up.use-case';

function buildTx() {
  return {} as any;
}

describe('ProcessWalletTopUpUseCase', () => {
  const walletTransaction = { id: 'wtx-1', wallet_id: 'wallet-1' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn() };
    const walletTransactions = { findByPaymentIntentId: jest.fn(), markCompleted: jest.fn() };
    const wallets = { findById: jest.fn(), credit: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new ProcessWalletTopUpUseCase(paymentIntents as any, walletTransactions as any, wallets as any, outbox as any);
    return { tx, paymentIntents, walletTransactions, wallets, outbox, useCase };
  }

  it('credits the wallet exactly once on the first successful webhook (scenario: wallet top-up success)', async () => {
    const { tx, paymentIntents, walletTransactions, wallets, outbox, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 1, status: 'CREATED', amount: { toString: () => '300.00' } });
    walletTransactions.findByPaymentIntentId.mockResolvedValue(walletTransaction);
    paymentIntents.markCaptured.mockResolvedValue(true);
    wallets.credit.mockResolvedValue({ id: 'wallet-1', user_id: 'user-1', balance: { toFixed: () => '800.00' } });

    const result = await useCase.execute(tx, { paymentIntentId: 'intent-1' });

    expect(wallets.credit).toHaveBeenCalledWith(tx, 'wallet-1', '300.00');
    expect(walletTransactions.markCompleted).toHaveBeenCalledWith(tx, 'wtx-1', '800.00');
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'WalletToppedUp', expect.objectContaining({ walletId: 'wallet-1', newBalance: '800.00' }));
    expect(result).toEqual({ walletId: 'wallet-1', newBalance: '800.00' });
  });

  it('does not credit twice for a duplicate webhook delivery for an already-CAPTURED intent (scenario: duplicate wallet top-up callback)', async () => {
    const { tx, paymentIntents, walletTransactions, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 2, status: 'CAPTURED', amount: { toString: () => '300.00' } });
    walletTransactions.findByPaymentIntentId.mockResolvedValue(walletTransaction);
    wallets.findById.mockResolvedValue({ balance: { toFixed: () => '800.00' } });

    const result = await useCase.execute(tx, { paymentIntentId: 'intent-1' });

    expect(wallets.credit).not.toHaveBeenCalled();
    expect(result.newBalance).toBe('800.00');
  });

  it('does not double-credit when markCaptured loses a race against a concurrent duplicate (defense in depth behind webhook_events)', async () => {
    const { tx, paymentIntents, walletTransactions, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ id: 'intent-1', version: 1, status: 'CREATED', amount: { toString: () => '300.00' } });
    walletTransactions.findByPaymentIntentId.mockResolvedValue(walletTransaction);
    paymentIntents.markCaptured.mockResolvedValue(false);
    wallets.findById.mockResolvedValue({ balance: { toFixed: () => '800.00' } });

    await useCase.execute(tx, { paymentIntentId: 'intent-1' });

    expect(wallets.credit).not.toHaveBeenCalled();
  });
});
