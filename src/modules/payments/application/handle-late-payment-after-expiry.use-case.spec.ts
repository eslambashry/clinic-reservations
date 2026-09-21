import { HandleLatePaymentAfterExpiryUseCase } from './handle-late-payment-after-expiry.use-case';

function buildTx() {
  return {} as any;
}

describe('HandleLatePaymentAfterExpiryUseCase', () => {
  const input = { paymentIntentId: 'intent-1', gatewayReference: 'attempt-1' };
  const intent = { id: 'intent-1', version: 1, status: 'CREATED', amount: { toString: () => '200.00' } };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn(), markRefunded: jest.fn() };
    const paymentAttempts = { findLatestByPaymentIntentId: jest.fn() };
    const refunds = { create: jest.fn() };
    const outbox = { emit: jest.fn() };
    const gateway = { refund: jest.fn() };
    const fawryGateway = { refund: jest.fn() };
    const useCase = new HandleLatePaymentAfterExpiryUseCase(
      paymentIntents as any,
      paymentAttempts as any,
      refunds as any,
      outbox as any,
      gateway as any,
      fawryGateway as any,
    );
    return { tx, paymentIntents, paymentAttempts, refunds, outbox, gateway, fawryGateway, useCase };
  }

  it('captures then immediately auto-refunds via the gateway when a success webhook arrives after the hold already expired', async () => {
    const { tx, paymentIntents, refunds, outbox, gateway, useCase } = setup();
    paymentIntents.findById.mockResolvedValueOnce(intent).mockResolvedValueOnce({ ...intent, version: 2, status: 'CAPTURED' });
    paymentIntents.markCaptured.mockResolvedValue(true);
    gateway.refund.mockResolvedValue({ gatewayRefundReference: 'refund-1' });

    await useCase.execute(tx, input);

    expect(paymentIntents.markCaptured).toHaveBeenCalledWith(tx, 'intent-1', 1);
    expect(gateway.refund).toHaveBeenCalledWith('attempt-1', '200.00');
    expect(paymentIntents.markRefunded).toHaveBeenCalledWith(tx, 'intent-1', 2, 'REFUNDED');
    expect(refunds.create).toHaveBeenCalledWith(tx, expect.objectContaining({ status: 'COMPLETED', reason: 'HOLD_EXPIRED_BEFORE_PAYMENT_CONFIRMED' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentAutoRefunded', expect.objectContaining({ requiresManualFollowUp: false }));
  });

  it('still records the capture+refund (flagged for manual follow-up) when the gateway refund call itself fails', async () => {
    const { tx, paymentIntents, refunds, outbox, gateway, useCase } = setup();
    paymentIntents.findById.mockResolvedValueOnce(intent).mockResolvedValueOnce({ ...intent, version: 2, status: 'CAPTURED' });
    paymentIntents.markCaptured.mockResolvedValue(true);
    gateway.refund.mockRejectedValue(new Error('gateway unavailable'));

    await useCase.execute(tx, input);

    expect(refunds.create).toHaveBeenCalledWith(tx, expect.objectContaining({ status: 'PROCESSING' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentAutoRefunded', expect.objectContaining({ requiresManualFollowUp: true }));
  });

  it('is a no-op for an intent that is no longer CREATED (already handled by an earlier delivery of the same late webhook)', async () => {
    const { tx, paymentIntents, gateway, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, status: 'CAPTURED' });

    await useCase.execute(tx, input);

    expect(paymentIntents.markCaptured).not.toHaveBeenCalled();
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('refunds via the Fawry gateway (not Paymob), keyed off the stored referenceCode, for a FAWRY intent', async () => {
    const { tx, paymentIntents, paymentAttempts, gateway, fawryGateway, useCase } = setup();
    const fawryIntent = { ...intent, method: 'FAWRY' };
    paymentIntents.findById.mockResolvedValueOnce(fawryIntent).mockResolvedValueOnce({ ...fawryIntent, version: 2, status: 'CAPTURED' });
    paymentIntents.markCaptured.mockResolvedValue(true);
    paymentAttempts.findLatestByPaymentIntentId.mockResolvedValue({ metadata: { referenceCode: '963455678' } });
    fawryGateway.refund.mockResolvedValue({});

    await useCase.execute(tx, input);

    expect(fawryGateway.refund).toHaveBeenCalledWith('963455678', '200.00', 'Hold expired before payment confirmed');
    expect(gateway.refund).not.toHaveBeenCalled();
    expect(paymentIntents.markRefunded).toHaveBeenCalledWith(tx, 'intent-1', 2, 'REFUNDED');
  });

  it('flags for manual follow-up (does not throw) when a FAWRY intent has no stored referenceCode', async () => {
    const { tx, paymentIntents, paymentAttempts, outbox, useCase } = setup();
    const fawryIntent = { ...intent, method: 'FAWRY' };
    paymentIntents.findById.mockResolvedValueOnce(fawryIntent).mockResolvedValueOnce({ ...fawryIntent, version: 2, status: 'CAPTURED' });
    paymentIntents.markCaptured.mockResolvedValue(true);
    paymentAttempts.findLatestByPaymentIntentId.mockResolvedValue(null);

    await useCase.execute(tx, input);

    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentAutoRefunded', expect.objectContaining({ requiresManualFollowUp: true }));
  });
});
