import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ProcessCancellationRefundUseCase } from './process-cancellation-refund.use-case';

function buildTx() {
  return {} as any;
}

describe('ProcessCancellationRefundUseCase', () => {
  const input = { paymentIntentId: 'intent-1', feePercent: 10 };
  const capturedIntent = { id: 'intent-1', version: 1, status: 'CAPTURED', amount: '200.00' };
  const commissionEntry = { provider_type: 'DOCTOR', provider_id: 'doctor-1', entry_type: 'COMMISSION_DEDUCTION', amount: '30.00' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { findById: jest.fn(), markRefunded: jest.fn() };
    const refunds = { create: jest.fn() };
    const ledger = { findByRelatedPaymentIntentId: jest.fn(), create: jest.fn() };
    const outbox = { emit: jest.fn() };
    const wallets = { credit: jest.fn() };
    const walletTransactions = { findByPaymentIntentId: jest.fn(), create: jest.fn() };
    const useCase = new ProcessCancellationRefundUseCase(
      paymentIntents as any,
      refunds as any,
      ledger as any,
      outbox as any,
      wallets as any,
      walletTransactions as any,
    );
    return { tx, paymentIntents, refunds, ledger, outbox, wallets, walletTransactions, useCase };
  }

  it('404s when the payment intent does not exist', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(null);

    await expect(useCase.execute(buildTx(), input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a non-CAPTURED intent as not refundable', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...capturedIntent, status: 'CREATED' });

    await expect(useCase.execute(buildTx(), input)).rejects.toMatchObject({ code: 'PAYMENT_INTENT_NOT_REFUNDABLE' });
  });

  it('409s when markRefunded loses a concurrent race', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(capturedIntent);
    paymentIntents.markRefunded.mockResolvedValue(false);

    await expect(useCase.execute(buildTx(), input)).rejects.toMatchObject({ code: 'PAYMENT_INTENT_STATE_CHANGED' });
  });

  it('marks REFUNDED (not PARTIALLY_REFUNDED) on a full refund (0% fee)', async () => {
    const { tx, paymentIntents, refunds, ledger, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(capturedIntent);
    paymentIntents.markRefunded.mockResolvedValue(true);
    ledger.findByRelatedPaymentIntentId.mockResolvedValue([commissionEntry]);

    const result = await useCase.execute(tx, { paymentIntentId: 'intent-1', feePercent: 0 });

    expect(paymentIntents.markRefunded).toHaveBeenCalledWith(tx, 'intent-1', 1, 'REFUNDED');
    expect(refunds.create).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', amount: '200.00', reason: 'APPOINTMENT_CANCELLED', status: 'COMPLETED' });
    expect(ledger.create).toHaveBeenCalledWith(tx, { providerType: 'DOCTOR', providerId: 'doctor-1', entryType: 'ADJUSTMENT', amount: '-30.00', relatedPaymentIntentId: 'intent-1' });
    expect(result).toEqual({ refundAmount: '200.00', feeApplied: '0.00' });
  });

  it('marks PARTIALLY_REFUNDED and reverses a proportional share of the commission on a partial refund', async () => {
    const { tx, paymentIntents, refunds, ledger, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(capturedIntent);
    paymentIntents.markRefunded.mockResolvedValue(true);
    ledger.findByRelatedPaymentIntentId.mockResolvedValue([commissionEntry]);

    const result = await useCase.execute(tx, input);

    expect(paymentIntents.markRefunded).toHaveBeenCalledWith(tx, 'intent-1', 1, 'PARTIALLY_REFUNDED');
    expect(refunds.create).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '180.00' }));
    expect(ledger.create).toHaveBeenCalledWith(tx, expect.objectContaining({ entryType: 'ADJUSTMENT', amount: '-27.00' }));
    expect(result).toEqual({ refundAmount: '180.00', feeApplied: '20.00' });
  });

  it('still writes the Refund row but skips the ledger reversal when no COMMISSION_DEDUCTION entry is found', async () => {
    const { tx, refunds, ledger, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(capturedIntent);
    paymentIntents.markRefunded.mockResolvedValue(true);
    ledger.findByRelatedPaymentIntentId.mockResolvedValue([]);

    await useCase.execute(tx, input);

    expect(refunds.create).toHaveBeenCalled();
    expect(ledger.create).not.toHaveBeenCalled();
  });

  it('credits the wallet back through a new REFUND transaction when the original payment method was INTERNAL_WALLET', async () => {
    const { tx, ledger, wallets, walletTransactions, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...capturedIntent, method: 'INTERNAL_WALLET' });
    paymentIntents.markRefunded.mockResolvedValue(true);
    ledger.findByRelatedPaymentIntentId.mockResolvedValue([]);
    walletTransactions.findByPaymentIntentId.mockResolvedValue({ wallet_id: 'wallet-1', appointment_id: 'appt-1' });
    wallets.credit.mockResolvedValue({ id: 'wallet-1', balance: { toFixed: () => '480.00' } });

    const result = await useCase.execute(tx, { paymentIntentId: 'intent-1', feePercent: 0 });

    expect(wallets.credit).toHaveBeenCalledWith(tx, 'wallet-1', '200.00');
    expect(walletTransactions.create).toHaveBeenCalledWith(tx, {
      walletId: 'wallet-1',
      type: 'REFUND',
      status: 'COMPLETED',
      amount: '200.00',
      resultingBalance: '480.00',
      paymentIntentId: 'intent-1',
      appointmentId: 'appt-1',
    });
    expect(result).toEqual({ refundAmount: '200.00', feeApplied: '0.00' });
  });
});
