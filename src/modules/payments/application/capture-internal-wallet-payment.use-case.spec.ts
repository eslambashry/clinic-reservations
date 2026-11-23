import { CaptureInternalWalletPaymentUseCase } from './capture-internal-wallet-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('CaptureInternalWalletPaymentUseCase', () => {
  const input = {
    payerUserId: 'patient-1',
    payableType: 'APPOINTMENT' as const,
    payableId: 'appointment-1',
    amount: '12.00',
    currency: 'EGP',
    idempotencyKey: 'hold:hold-1',
  };
  const wallet = { id: 'wallet-1' };
  const intent = { id: 'intent-1', version: 1 };

  function setup() {
    const tx = buildTx();
    const wallets = { getOrCreate: jest.fn(), debit: jest.fn(), findById: jest.fn() };
    const walletTransactions = { create: jest.fn() };
    const paymentIntents = { create: jest.fn(), markCaptured: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CaptureInternalWalletPaymentUseCase(wallets as any, walletTransactions as any, paymentIntents as any, outbox as any);
    return { tx, wallets, walletTransactions, paymentIntents, outbox, useCase };
  }

  it('debits the service fee from the wallet and captures the payment (no commission split / ledger)', async () => {
    const { tx, wallets, walletTransactions, paymentIntents, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(true);
    wallets.findById.mockResolvedValue({ id: 'wallet-1', balance: { toFixed: () => '88.00' } });
    paymentIntents.create.mockResolvedValue(intent);
    paymentIntents.markCaptured.mockResolvedValue(true);

    const result = await useCase.execute(tx, input);

    expect(wallets.debit).toHaveBeenCalledWith(tx, 'wallet-1', '12.00');
    expect(walletTransactions.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: 'APPOINTMENT_PAYMENT',
        status: 'COMPLETED',
        amount: '12.00',
        resultingBalance: '88.00',
        paymentIntentId: 'intent-1',
        appointmentId: 'appointment-1',
      }),
    );
    expect(result).toEqual({ paymentIntentId: 'intent-1', newWalletBalance: '88.00' });
  });

  it('throws INSUFFICIENT_WALLET_BALANCE and creates no PaymentIntent when the debit fails', async () => {
    const { tx, wallets, paymentIntents, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET_BALANCE' });
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });

  it('debits exactly once per invocation', async () => {
    const { tx, wallets, useCase } = setup();
    wallets.getOrCreate.mockResolvedValue(wallet);
    wallets.debit.mockResolvedValue(false);

    await expect(useCase.execute(tx, input)).rejects.toBeDefined();
    expect(wallets.debit).toHaveBeenCalledTimes(1);
  });
});
