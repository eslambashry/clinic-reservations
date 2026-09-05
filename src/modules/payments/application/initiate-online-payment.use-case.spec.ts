import { InitiateOnlinePaymentUseCase } from './initiate-online-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('InitiateOnlinePaymentUseCase', () => {
  const customer = { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com', phone: '+201000000000' };
  const baseInput = {
    payerUserId: 'patient-1',
    payableType: 'APPOINTMENT' as const,
    payableId: 'appointment-1',
    amount: '200.00',
    currency: 'EGP',
    idempotencyKey: 'hold:hold-1',
    customer,
  };
  const intent = { id: 'intent-1', version: 1, status: 'CREATED' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { create: jest.fn(), findById: jest.fn() };
    const paymentAttempts = { create: jest.fn(), updateStatus: jest.fn() };
    const gateway = { initiateCardPayment: jest.fn(), initiateFawryPayment: jest.fn(), initiateMobileWalletPayment: jest.fn() };
    const useCase = new InitiateOnlinePaymentUseCase(paymentIntents as any, paymentAttempts as any, gateway as any);
    return { tx, paymentIntents, paymentAttempts, gateway, useCase };
  }

  it('creates a new CARD PaymentIntent + PaymentAttempt and returns the gateway iframe URL', async () => {
    const { tx, paymentIntents, paymentAttempts, gateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockResolvedValue({ gatewayReference: 'attempt-x', redirectUrl: 'https://accept.paymob.com/iframe/x' });

    const result = await useCase.execute(tx, { ...baseInput, method: 'CARD' });

    expect(paymentIntents.create).toHaveBeenCalledWith(tx, expect.objectContaining({ method: 'CARD', idempotencyKey: 'hold:hold-1' }));
    expect(paymentAttempts.create).toHaveBeenCalledWith(tx, expect.objectContaining({ paymentIntentId: 'intent-1' }));
    expect(result).toMatchObject({ paymentIntentId: 'intent-1', method: 'CARD', redirectUrl: 'https://accept.paymob.com/iframe/x' });
  });

  it('returns a Fawry reference code (no redirectUrl) for method=FAWRY', async () => {
    const { tx, paymentIntents, gateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateFawryPayment.mockResolvedValue({ gatewayReference: 'attempt-x', referenceCode: '123456789' });

    const result = await useCase.execute(tx, { ...baseInput, method: 'FAWRY' });

    expect(result).toMatchObject({ method: 'FAWRY', referenceCode: '123456789' });
    expect(result.redirectUrl).toBeUndefined();
  });

  it('rejects mobile wallet without walletProvider/walletMobileNumber', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);

    await expect(useCase.execute(tx, { ...baseInput, method: 'MOBILE_WALLET' })).rejects.toMatchObject({ code: 'WALLET_INFO_REQUIRED' });
  });

  it('initiates a mobile wallet payment and returns the telecom-approval redirect', async () => {
    const { tx, gateway, paymentIntents, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateMobileWalletPayment.mockResolvedValue({ gatewayReference: 'attempt-x', redirectUrl: 'https://accept.paymob.com/wallet/x' });

    const result = await useCase.execute(tx, {
      ...baseInput,
      method: 'MOBILE_WALLET',
      walletProvider: 'VODAFONE_CASH',
      walletMobileNumber: '+201012345678',
    });

    expect(gateway.initiateMobileWalletPayment).toHaveBeenCalledWith(
      expect.objectContaining({ walletProvider: 'VODAFONE_CASH', walletMobileNumber: '+201012345678' }),
    );
    expect(result).toMatchObject({ method: 'MOBILE_WALLET', redirectUrl: 'https://accept.paymob.com/wallet/x' });
  });

  it('marks the attempt FAILED (not the intent) when the gateway call throws — the intent stays retryable', async () => {
    const { tx, paymentIntents, paymentAttempts, gateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockRejectedValue(new Error('gateway timeout'));

    await expect(useCase.execute(tx, { ...baseInput, method: 'CARD' })).rejects.toThrow('gateway timeout');

    expect(paymentAttempts.updateStatus).toHaveBeenCalledWith(tx, expect.any(String), 'FAILED', { failureCode: 'GATEWAY_INITIATE_FAILED' });
  });

  it('retries against the same still-CREATED intent instead of creating a duplicate one', async () => {
    const { tx, paymentIntents, gateway, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockResolvedValue({ gatewayReference: 'attempt-y', redirectUrl: 'https://accept.paymob.com/iframe/y' });

    const result = await useCase.execute(tx, { ...baseInput, method: 'CARD', existingPaymentIntentId: 'intent-1' });

    expect(paymentIntents.create).not.toHaveBeenCalled();
    expect(result.paymentIntentId).toBe('intent-1');
  });

  it('rejects a retry against an intent that is no longer CREATED (already captured/cancelled)', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, status: 'CAPTURED' });

    await expect(useCase.execute(tx, { ...baseInput, method: 'CARD', existingPaymentIntentId: 'intent-1' })).rejects.toMatchObject({
      code: 'PAYMENT_INTENT_NOT_RETRYABLE',
    });
  });
});
