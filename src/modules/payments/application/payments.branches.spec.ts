import { CaptureInternalWalletPaymentUseCase } from './capture-internal-wallet-payment.use-case';
import { FindPaymentByGatewayReferenceUseCase } from './find-payment-by-gateway-reference.use-case';
import { ProcessWalletTopUpUseCase } from './process-wallet-top-up.use-case';

const tx = {} as any;

describe('ProcessWalletTopUpUseCase branches', () => {
  function setup() {
    const paymentIntents = { findById: jest.fn(), markCaptured: jest.fn() };
    const walletTransactions = { findByPaymentIntentId: jest.fn(), markCompleted: jest.fn() };
    const wallets = { findById: jest.fn(), credit: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new ProcessWalletTopUpUseCase(paymentIntents as any, walletTransactions as any, wallets as any, outbox as any);
    return { paymentIntents, walletTransactions, wallets, outbox, useCase };
  }
  const intent = { id: 'i1', version: 1, status: 'CREATED', payable_id: 'p1', amount: { toString: () => '10.00' } };

  it('404s when the intent is missing', async () => {
    const { paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(null);
    await expect(useCase.execute(tx, { paymentIntentId: 'i1' })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the wallet transaction is missing', async () => {
    const { paymentIntents, walletTransactions, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    walletTransactions.findByPaymentIntentId.mockResolvedValue(null);
    await expect(useCase.execute(tx, { paymentIntentId: 'i1' })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('non-CREATED intent with a vanished wallet reports 0.00 without crediting', async () => {
    const { paymentIntents, walletTransactions, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, status: 'CAPTURED' });
    walletTransactions.findByPaymentIntentId.mockResolvedValue({ id: 'w', wallet_id: 'wl' });
    wallets.findById.mockResolvedValue(null);
    expect(await useCase.execute(tx, { paymentIntentId: 'i1' })).toEqual({ walletId: 'wl', newBalance: '0.00' });
    expect(wallets.credit).not.toHaveBeenCalled();
  });

  it('lost capture race returns current balance (or 0.00) and does not credit', async () => {
    const { paymentIntents, walletTransactions, wallets, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    walletTransactions.findByPaymentIntentId.mockResolvedValue({ id: 'w', wallet_id: 'wl' });
    paymentIntents.markCaptured.mockResolvedValue(false);
    wallets.findById.mockResolvedValueOnce({ balance: { toFixed: () => '7.00' } }).mockResolvedValueOnce(null);
    expect((await useCase.execute(tx, { paymentIntentId: 'i1' })).newBalance).toBe('7.00');
    expect((await useCase.execute(tx, { paymentIntentId: 'i1' })).newBalance).toBe('0.00');
    expect(wallets.credit).not.toHaveBeenCalled();
  });
});

describe('FindPaymentByGatewayReferenceUseCase branches', () => {
  it('returns null when no attempt matches, and when the intent is gone', async () => {
    const attempts = { findByGatewayReference: jest.fn().mockResolvedValue(null), findByFawryMerchantRefNum: jest.fn().mockResolvedValue(null) };
    const intents = { findById: jest.fn() };
    const uc = new FindPaymentByGatewayReferenceUseCase(attempts as any, intents as any);
    expect(await uc.execute(tx, 'abc', 'fawry')).toBeNull();
    attempts.findByGatewayReference.mockResolvedValue({ id: 'a', payment_intent_id: 'i' });
    intents.findById.mockResolvedValue(null);
    expect(await uc.execute(tx, 'abc', 'fawry')).toBeNull();
    expect(intents.findById).toHaveBeenCalledWith(tx, 'i');
  });
});

describe('CaptureInternalWalletPaymentUseCase branches', () => {
  const input = {
    payerUserId: 'p',
    payableType: 'APPOINTMENT' as const,
    payableId: 'a1',
    amount: '200.00',
    currency: 'EGP',
    providerType: 'DOCTOR' as const,
    providerId: 'd1',
    idempotencyKey: 'k',
  };
  function setup() {
    const wallets = { getOrCreate: jest.fn().mockResolvedValue({ id: 'w' }), debit: jest.fn().mockResolvedValue(true), findById: jest.fn() };
    const paymentIntents = { create: jest.fn().mockResolvedValue({ id: 'i', version: 1 }), markCaptured: jest.fn() };
    const policyConfig = { getValue: jest.fn() };
    const uc = new CaptureInternalWalletPaymentUseCase(
      wallets as any,
      { create: jest.fn() } as any,
      paymentIntents as any,
      { create: jest.fn() } as any,
      { create: jest.fn() } as any,
      policyConfig as any,
      { emit: jest.fn() } as any,
    );
    return { paymentIntents, policyConfig, uc };
  }

  it('500s when the commission rate is not configured', async () => {
    const { policyConfig, uc } = setup();
    policyConfig.getValue.mockResolvedValue(null);
    await expect(uc.execute(tx, input)).rejects.toMatchObject({ code: 'COMMISSION_RATE_NOT_CONFIGURED' });
  });

  it('500s when the intent cannot be marked captured', async () => {
    const { paymentIntents, policyConfig, uc } = setup();
    policyConfig.getValue.mockResolvedValue({ ratePercent: 10 });
    paymentIntents.markCaptured.mockResolvedValue(false);
    await expect(uc.execute(tx, input)).rejects.toMatchObject({ code: 'PAYMENT_CAPTURE_FAILED' });
  });
});
