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
    const outbox = { emit: jest.fn() };
    const useCase = new MarkOnlinePaymentFailedUseCase(paymentAttempts as any, paymentIntents as any, walletTransactions as any, outbox as any);
    return { tx, paymentAttempts, paymentIntents, walletTransactions, outbox, useCase };
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

  it('emits PaymentFailed with the intent details so a future Notifications consumer can tell the patient to retry', async () => {
    const { tx, paymentIntents, outbox, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({
      id: 'intent-1',
      payer_user_id: 'patient-1',
      payable_type: 'APPOINTMENT',
      payable_id: 'appointment-1',
      method: 'FAWRY',
    });

    await useCase.execute(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'GATEWAY_DECLINED' });

    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentFailed', {
      paymentIntentId: 'intent-1',
      payerUserId: 'patient-1',
      payableType: 'APPOINTMENT',
      payableId: 'appointment-1',
      method: 'FAWRY',
      failureCode: 'GATEWAY_DECLINED',
    });
  });

  it('does not emit PaymentFailed when the intent can no longer be found', async () => {
    const { tx, paymentIntents, outbox, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(null);

    await useCase.execute(tx, { paymentAttemptId: 'attempt-1', paymentIntentId: 'intent-1', failureCode: 'GATEWAY_DECLINED' });

    expect(outbox.emit).not.toHaveBeenCalled();
  });
});
