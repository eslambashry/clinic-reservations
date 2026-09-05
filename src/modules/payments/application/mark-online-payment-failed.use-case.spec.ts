import { MarkOnlinePaymentFailedUseCase } from './mark-online-payment-failed.use-case';

function buildTx() {
  return {} as any;
}

describe('MarkOnlinePaymentFailedUseCase', () => {
  function setup() {
    const tx = buildTx();
    const paymentAttempts = { updateStatus: jest.fn() };
    const paymentIntents = { findById: jest.fn() };
    const walletTransactions = { findByPaymentIntentId: jest.fn(), markFailed: jest.fn() };
    const useCase = new MarkOnlinePaymentFailedUseCase(paymentAttempts as any, paymentIntents as any, walletTransactions as any);
    return { tx, paymentAttempts, paymentIntents, walletTransactions, useCase };
  }

  it('marks the attempt FAILED but leaves the intent alone for a card/Fawry/wallet appointment payment (client may retry)', async () => {
    const { tx, paymentAttempts, paymentIntents, walletTransactions, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ id: 'intent-1', payable_type: 'APPOINTMENT' });

    await useCase.execute(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'GATEWAY_DECLINED' });

    expect(paymentAttempts.updateStatus).toHaveBeenCalledWith(tx, 'attempt-1', 'FAILED', { failureCode: 'GATEWAY_DECLINED' });
    expect(walletTransactions.markFailed).not.toHaveBeenCalled();
  });

  it('also marks the WalletTransaction FAILED for a failed WALLET_TOPUP', async () => {
    const { tx, paymentIntents, walletTransactions, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ id: 'intent-1', payable_type: 'WALLET_TOPUP' });
    walletTransactions.findByPaymentIntentId.mockResolvedValue({ id: 'wtx-1' });

    await useCase.execute(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'GATEWAY_DECLINED' });

    expect(walletTransactions.markFailed).toHaveBeenCalledWith(tx, 'wtx-1', 'GATEWAY_DECLINED');
  });
});
