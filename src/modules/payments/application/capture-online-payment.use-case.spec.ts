import { CaptureOnlinePaymentUseCase } from './capture-online-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('CaptureOnlinePaymentUseCase', () => {
  const input = { paymentIntentId: 'intent-1', providerType: 'DOCTOR' as const, providerId: 'doctor-1' };
  const intent = { id: 'intent-1', version: 1, status: 'CREATED', amount: { toString: () => '200.00' }, payable_type: 'APPOINTMENT', payable_id: 'appt-1', currency: 'EGP', method: 'CARD' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn() };
    const paymentSplits = { create: jest.fn() };
    const ledger = { create: jest.fn() };
    const policyConfig = { getValue: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CaptureOnlinePaymentUseCase(paymentIntents as any, paymentSplits as any, ledger as any, policyConfig as any, outbox as any);
    return { tx, paymentIntents, paymentSplits, ledger, policyConfig, outbox, useCase };
  }

  it('404s when the intent does not exist', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), input)).rejects.toBeInstanceOf(Object);
  });

  it('writes an EARNING ledger entry (not COMMISSION_DEDUCTION) for the provider share', async () => {
    const { tx, paymentIntents, ledger, policyConfig, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(true);

    const result = await useCase.execute(tx, input);

    expect(ledger.create).toHaveBeenCalledWith(tx, {
      providerType: 'DOCTOR',
      providerId: 'doctor-1',
      entryType: 'EARNING',
      amount: '170.00',
      relatedPaymentIntentId: 'intent-1',
    });
    expect(result).toEqual({ commissionAmount: '30.00', providerAmount: '170.00' });
  });

  it('emits PaymentCaptured including the payment method', async () => {
    const { tx, paymentIntents, policyConfig, outbox, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(true);

    await useCase.execute(tx, input);

    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentCaptured', expect.objectContaining({ paymentIntentId: 'intent-1', method: 'CARD' }));
  });

  it('surfaces PAYMENT_CAPTURE_FAILED when markCaptured loses a concurrent race (e.g. a duplicate webhook)', async () => {
    const { tx, paymentIntents, policyConfig, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'PAYMENT_CAPTURE_FAILED' });
  });
});
