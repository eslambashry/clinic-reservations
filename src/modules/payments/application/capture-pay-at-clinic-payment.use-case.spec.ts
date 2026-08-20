import { CapturePayAtClinicPaymentUseCase } from './capture-pay-at-clinic-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('CapturePayAtClinicPaymentUseCase', () => {
  const input = {
    payerUserId: 'patient-1',
    payableType: 'APPOINTMENT' as const,
    payableId: 'appointment-1',
    amount: '200.00',
    currency: 'EGP',
    providerType: 'DOCTOR' as const,
    providerId: 'doctor-1',
    idempotencyKey: 'hold:hold-1',
  };
  const intent = { id: 'intent-1', version: 1 };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { create: jest.fn(), markCaptured: jest.fn() };
    const paymentSplits = { create: jest.fn() };
    const ledger = { create: jest.fn() };
    const policyConfig = { getValue: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CapturePayAtClinicPaymentUseCase(paymentIntents as any, paymentSplits as any, ledger as any, policyConfig as any, outbox as any);
    return { tx, paymentIntents, paymentSplits, ledger, policyConfig, outbox, useCase };
  }

  it('throws COMMISSION_RATE_NOT_CONFIGURED when no COMMISSION_RATE policy_config is set', async () => {
    const { tx, paymentIntents, policyConfig, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue(null);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'COMMISSION_RATE_NOT_CONFIGURED' });
  });

  it('throws PAYMENT_CAPTURE_FAILED when markCaptured loses a concurrent race', async () => {
    const { tx, paymentIntents, policyConfig, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'PAYMENT_CAPTURE_FAILED' });
  });

  it('creates the intent, reads the commission rate, captures it, writes both splits and one ledger row, and emits PaymentCaptured', async () => {
    const { tx, paymentIntents, paymentSplits, ledger, policyConfig, outbox, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(true);

    const result = await useCase.execute(tx, input);

    expect(paymentIntents.create).toHaveBeenCalledWith(tx, {
      payerUserId: input.payerUserId,
      payableType: input.payableType,
      payableId: input.payableId,
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
    });
    expect(policyConfig.getValue).toHaveBeenCalledWith(tx, 'EG', 'COMMISSION_RATE');
    expect(paymentIntents.markCaptured).toHaveBeenCalledWith(tx, 'intent-1', 1);
    expect(paymentSplits.create).toHaveBeenCalledWith(tx, {
      paymentIntentId: 'intent-1',
      payeeType: 'PLATFORM',
      amount: '30.00',
      type: 'COMMISSION',
    });
    expect(paymentSplits.create).toHaveBeenCalledWith(tx, {
      paymentIntentId: 'intent-1',
      payeeType: 'PROVIDER',
      payeeId: 'doctor-1',
      amount: '170.00',
      type: 'PROVIDER_SHARE',
    });
    expect(ledger.create).toHaveBeenCalledWith(tx, {
      providerType: 'DOCTOR',
      providerId: 'doctor-1',
      entryType: 'COMMISSION_DEDUCTION',
      amount: '30.00',
      relatedPaymentIntentId: 'intent-1',
    });
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'PaymentCaptured',
      expect.objectContaining({ paymentIntentId: 'intent-1', amount: '200.00' }),
    );
    expect(result).toEqual({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00' });
  });
});
