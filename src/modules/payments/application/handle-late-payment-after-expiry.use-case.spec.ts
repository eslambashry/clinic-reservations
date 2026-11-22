import { HandleLatePaymentAfterExpiryUseCase } from './handle-late-payment-after-expiry.use-case';

function buildTx() {
  return {} as any;
}

describe('HandleLatePaymentAfterExpiryUseCase', () => {
  const input = { paymentIntentId: 'intent-1', gatewayReference: 'attempt-1' };
  const intent = {
    id: 'intent-1',
    version: 1,
    status: 'CREATED',
    method: 'CARD',
    payer_user_id: 'patient-1',
    currency: 'EGP',
    amount: { toString: () => '12.00' },
  };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn(), markRefunded: jest.fn() };
    const paymentAttempts = { findLatestByPaymentIntentId: jest.fn() };
    const refunds = { create: jest.fn() };
    const outbox = { emit: jest.fn() };
    const gateway = { refund: jest.fn() };
    const fawryGateway = { refund: jest.fn() };
    const wallets = { getOrCreate: jest.fn().mockResolvedValue({ id: 'wallet-1' }), credit: jest.fn().mockResolvedValue({ balance: { toFixed: () => '12.00' } }) };
    const walletTransactions = { create: jest.fn() };
    const useCase = new HandleLatePaymentAfterExpiryUseCase(
      paymentIntents as any,
      paymentAttempts as any,
      refunds as any,
      outbox as any,
      gateway as any,
      fawryGateway as any,
      wallets as any,
      walletTransactions as any,
    );
    return { tx, paymentIntents, paymentAttempts, refunds, outbox, gateway, fawryGateway, wallets, walletTransactions, useCase };
  }

  it('captures the late payment then credits it to the patient wallet (no gateway refund) and records a COMPLETED refund', async () => {
    const { tx, paymentIntents, refunds, outbox, gateway, fawryGateway, wallets, walletTransactions, useCase } = setup();
    paymentIntents.findById.mockResolvedValueOnce(intent).mockResolvedValueOnce({ ...intent, version: 2, status: 'CAPTURED' });
    paymentIntents.markCaptured.mockResolvedValue(true);

    await useCase.execute(tx, input);

    expect(paymentIntents.markCaptured).toHaveBeenCalledWith(tx, 'intent-1', 1);
    expect(wallets.getOrCreate).toHaveBeenCalledWith(tx, 'patient-1', 'EGP');
    expect(wallets.credit).toHaveBeenCalledWith(tx, 'wallet-1', '12.00');
    expect(walletTransactions.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ walletId: 'wallet-1', type: 'REFUND', status: 'COMPLETED', amount: '12.00', paymentIntentId: 'intent-1' }),
    );
    expect(gateway.refund).not.toHaveBeenCalled();
    expect(fawryGateway.refund).not.toHaveBeenCalled();
    expect(paymentIntents.markRefunded).toHaveBeenCalledWith(tx, 'intent-1', 2, 'REFUNDED');
    expect(refunds.create).toHaveBeenCalledWith(tx, expect.objectContaining({ status: 'COMPLETED', reason: 'HOLD_EXPIRED_BEFORE_PAYMENT_CONFIRMED' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentAutoRefunded', expect.objectContaining({ requiresManualFollowUp: false }));
  });

  it('is a no-op for an intent that is no longer CREATED (already handled by an earlier delivery of the same late webhook)', async () => {
    const { tx, paymentIntents, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, status: 'CAPTURED' });

    await useCase.execute(tx, input);

    expect(paymentIntents.markCaptured).not.toHaveBeenCalled();
    expect(wallets.credit).not.toHaveBeenCalled();
  });

  it('does not credit the wallet when markCaptured loses a race', async () => {
    const { tx, paymentIntents, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    paymentIntents.markCaptured.mockResolvedValue(false);

    await useCase.execute(tx, input);

    expect(wallets.credit).not.toHaveBeenCalled();
  });
});
