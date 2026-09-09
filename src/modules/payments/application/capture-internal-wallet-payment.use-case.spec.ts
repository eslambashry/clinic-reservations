import { CaptureInternalWalletPaymentUseCase } from './capture-internal-wallet-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('CaptureInternalWalletPaymentUseCase', () => {
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
  const wallet = { id: 'wallet-1' };
  const intent = { id: 'intent-1', version: 1 };

  function setup() {
    const tx = buildTx();
    const wallets = { getOrCreate: jest.fn(), debit: jest.fn(), findById: jest.fn() };
    const walletTransactions = { create: jest.fn() };
    const paymentIntents = { create: jest.fn(), markCaptured: jest.fn() };
    const paymentSplits = { create: jest.fn() };
    const ledger = { create: jest.fn() };
    const policyConfig = { getValue: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CaptureInternalWalletPaymentUseCase(
      wallets as any,
      walletTransactions as any,
      paymentIntents as any,
      paymentSplits as any,
      ledger as any,
      policyConfig as any,
      outbox as any,
    );
    return { tx, wallets, walletTransactions, paymentIntents, paymentSplits, ledger, policyConfig, outbox, useCase };
  }

  it('debits the wallet, captures the payment, and writes an EARNING ledger entry (scenario: wallet appointment payment)', async () => {
    const { tx, wallets, walletTransactions, paymentIntents, ledger, policyConfig, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(true);
    wallets.findById.mockResolvedValue({ id: 'wallet-1', balance: { toFixed: () => '300.00' } });
    paymentIntents.create.mockResolvedValue(intent);
    policyConfig.getValue.mockResolvedValue({ ratePercent: 15 });
    paymentIntents.markCaptured.mockResolvedValue(true);

    const result = await useCase.execute(tx, input);

    expect(wallets.debit).toHaveBeenCalledWith(tx, 'wallet-1', '200.00');
    expect(ledger.create).toHaveBeenCalledWith(tx, expect.objectContaining({ entryType: 'EARNING', amount: '170.00' }));
    expect(walletTransactions.create).toHaveBeenCalledWith(tx, expect.objectContaining({
      type: 'APPOINTMENT_PAYMENT',
      status: 'COMPLETED',
      amount: '200.00',
      resultingBalance: '300.00',
      paymentIntentId: 'intent-1',
      appointmentId: 'appointment-1',
    }));
    expect(result).toEqual({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00', newWalletBalance: '300.00' });
  });

  it('throws INSUFFICIENT_WALLET_BALANCE and creates no PaymentIntent when the debit fails (scenario: insufficient wallet balance)', async () => {
    const { tx, wallets, paymentIntents, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET_BALANCE' });
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });

  it('never debits twice for the same call (double-debit protection lives one level up, in the hold\'s optimistic lock) — this use-case itself always debits exactly once per invocation', async () => {
    const { tx, wallets, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toBeDefined();
    expect(wallets.debit).toHaveBeenCalledTimes(1);
  });
});
