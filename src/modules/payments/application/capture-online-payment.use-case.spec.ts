import { CaptureOnlinePaymentUseCase } from './capture-online-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('CaptureOnlinePaymentUseCase', () => {
  const input = { paymentIntentId: 'intent-1' };
  const intent = { id: 'intent-1', version: 1, status: 'CREATED', amount: { toString: () => '12.00' }, payable_type: 'APPOINTMENT', payable_id: 'appt-1', currency: 'EGP', method: 'CARD' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CaptureOnlinePaymentUseCase(paymentIntents as any, outbox as any);
    return { tx, paymentIntents, outbox, useCase };
  }

  it('404s when the intent does not exist', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), input)).rejects.toBeInstanceOf(Object);
  });

  it('captures the intent without any commission split or ledger entry', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    paymentIntents.markCaptured.mockResolvedValue(true);

    await expect(useCase.execute(tx, input)).resolves.toEqual({});
    expect(paymentIntents.markCaptured).toHaveBeenCalledWith(tx, 'intent-1', 1);
  });

  it('emits PaymentCaptured including the payment method', async () => {
    const { tx, paymentIntents, outbox, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    paymentIntents.markCaptured.mockResolvedValue(true);

    await useCase.execute(tx, input);

    expect(outbox.emit).toHaveBeenCalledWith(tx, 'PaymentCaptured', expect.objectContaining({ paymentIntentId: 'intent-1', method: 'CARD' }));
  });

  it('surfaces PAYMENT_CAPTURE_FAILED when markCaptured loses a concurrent race (e.g. a duplicate webhook)', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    paymentIntents.markCaptured.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'PAYMENT_CAPTURE_FAILED' });
  });
});
