import { InitiateOnlinePaymentUseCase } from './initiate-online-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('InitiateOnlinePaymentUseCase', () => {
  const customer = { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com', phone: '+201000000000' };
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const baseInput = {
    payerUserId: 'patient-1',
    payableType: 'APPOINTMENT' as const,
    payableId: 'appointment-1',
    amount: '200.00',
    currency: 'EGP',
    idempotencyKey: 'hold:hold-1',
    customer,
    expiresAt,
  };
  const intent = { id: 'intent-1', version: 1, status: 'CREATED' };

  function setup() {
    const tx = buildTx();
    const paymentIntents = { create: jest.fn(), findById: jest.fn() };
    // The DB assigns `fawry_merchant_ref_num` from a sequence on insert.
    const paymentAttempts = { create: jest.fn().mockResolvedValue({ fawry_merchant_ref_num: BigInt(4242) }), updateStatus: jest.fn() };
    const gateway = { initiateCardPayment: jest.fn() };
    const fawryGateway = { initiatePayment: jest.fn(), initiateMobileWalletPayment: jest.fn() };
    const useCase = new InitiateOnlinePaymentUseCase(paymentIntents as any, paymentAttempts as any, gateway as any, fawryGateway as any);
    return { tx, paymentIntents, paymentAttempts, gateway, fawryGateway, useCase };
  }

  it('creates a new CARD PaymentIntent + PaymentAttempt and returns the gateway iframe URL', async () => {
    const { tx, paymentIntents, paymentAttempts, gateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockResolvedValue({ gatewayReference: 'attempt-x', redirectUrl: 'https://accept.paymob.com/iframe/x' });

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'CARD' });
    const result = await useCase.callGateway(prepared);

    expect(paymentIntents.create).toHaveBeenCalledWith(tx, expect.objectContaining({ method: 'CARD', idempotencyKey: 'hold:hold-1' }));
    expect(paymentAttempts.create).toHaveBeenCalledWith(tx, expect.objectContaining({ paymentIntentId: 'intent-1' }));
    expect(prepared).toMatchObject({ paymentIntentId: 'intent-1', method: 'CARD' });
    expect(result).toMatchObject({ redirectUrl: 'https://accept.paymob.com/iframe/x' });
  });

  it('sends Paymob the attempt UUID, but Fawry the numeric fawry_merchant_ref_num — never the UUID (File 12 Part 55)', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);

    const card = await useCase.prepare(tx, { ...baseInput, method: 'CARD' });
    const fawry = await useCase.prepare(tx, { ...baseInput, method: 'FAWRY' });
    const wallet = await useCase.prepare(tx, { ...baseInput, method: 'MOBILE_WALLET', walletMobileNumber: '01012345678' });

    expect(card.gatewayInput.merchantReference).toBe(card.paymentAttemptId);
    expect(fawry.gatewayInput.merchantReference).toBe('4242');
    expect(wallet.gatewayInput.merchantReference).toBe('4242');
  });

  it('returns a Fawry reference code (no redirectUrl) for method=FAWRY, via the Fawry gateway (never Paymob)', async () => {
    const { tx, paymentIntents, gateway, fawryGateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    fawryGateway.initiatePayment.mockResolvedValue({ gatewayReference: 'attempt-x', referenceCode: '123456789' });

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'FAWRY' });
    const result = await useCase.callGateway(prepared);

    expect(result).toMatchObject({ referenceCode: '123456789' });
    expect(result.redirectUrl).toBeUndefined();
    expect(gateway.initiateCardPayment).not.toHaveBeenCalled();
  });

  it('passes the caller-computed expiresAt through to the Fawry gateway unchanged — never recalculated here (File 12 Part 51)', async () => {
    const { tx, paymentIntents, fawryGateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    fawryGateway.initiatePayment.mockResolvedValue({ gatewayReference: 'attempt-x', referenceCode: '123456789' });

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'FAWRY' });
    await useCase.callGateway(prepared);

    expect(fawryGateway.initiatePayment).toHaveBeenCalledWith(expect.objectContaining({ expiresAt }));
  });

  it('rejects mobile wallet without walletMobileNumber, before calling any gateway', async () => {
    const { tx, paymentIntents, fawryGateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'MOBILE_WALLET' });

    await expect(useCase.callGateway(prepared)).rejects.toMatchObject({ code: 'WALLET_INFO_REQUIRED' });
    expect(fawryGateway.initiateMobileWalletPayment).not.toHaveBeenCalled();
  });

  it('routes MOBILE_WALLET to Fawry MWALLET (never Paymob) and returns Fawry\'s reference, with no redirectUrl', async () => {
    const { tx, gateway, fawryGateway, paymentIntents, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    fawryGateway.initiateMobileWalletPayment.mockResolvedValue({ gatewayReference: '4242', referenceCode: '7700123' });

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'MOBILE_WALLET', walletMobileNumber: '01012345678' });
    const result = await useCase.callGateway(prepared);

    expect(fawryGateway.initiateMobileWalletPayment).toHaveBeenCalledWith(
      expect.objectContaining({ merchantReference: '4242', debitMobileWalletNo: '01012345678', expiresAt }),
    );
    expect(fawryGateway.initiateMobileWalletPayment.mock.calls[0][0]).not.toHaveProperty('walletProvider');
    expect(gateway.initiateCardPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ metadata: { gatewayReference: '4242', referenceCode: '7700123' }, referenceCode: '7700123' });
  });

  it('marks the attempt FAILED (not the intent) when the gateway call throws — the intent stays retryable', async () => {
    const { tx, paymentIntents, paymentAttempts, gateway, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockRejectedValue(new Error('gateway timeout'));

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'CARD' });
    await expect(useCase.callGateway(prepared)).rejects.toThrow('gateway timeout');
    await useCase.completeFailure(tx, prepared.paymentAttemptId);

    expect(paymentAttempts.updateStatus).toHaveBeenCalledWith(tx, prepared.paymentAttemptId, 'FAILED', { failureCode: 'GATEWAY_INITIATE_FAILED' });
  });

  it('retries against the same still-CREATED intent instead of creating a duplicate one', async () => {
    const { tx, paymentIntents, gateway, useCase } = setup();
    paymentIntents.findById.mockResolvedValue(intent);
    gateway.initiateCardPayment.mockResolvedValue({ gatewayReference: 'attempt-y', redirectUrl: 'https://accept.paymob.com/iframe/y' });

    const prepared = await useCase.prepare(tx, { ...baseInput, method: 'CARD', existingPaymentIntentId: 'intent-1' });

    expect(paymentIntents.create).not.toHaveBeenCalled();
    expect(prepared.paymentIntentId).toBe('intent-1');
  });

  it('stores full_amount on a new intent and sends the (partial) amount to the gateway', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.create.mockResolvedValue(intent);

    const prepared = await useCase.prepare(tx, { ...baseInput, amount: '50.00', fullAmount: '300.00', method: 'CARD' });

    expect(paymentIntents.create).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '50.00', fullAmount: '300.00' }));
    expect(prepared.gatewayInput.amount).toBe('50.00');
  });

  it('on retry, the stored intent amount wins over whatever amount is sent the second time', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, amount: { toFixed: () => '50.00' } });

    const prepared = await useCase.prepare(tx, { ...baseInput, amount: '300.00', method: 'CARD', existingPaymentIntentId: 'intent-1' });

    expect(prepared.gatewayInput.amount).toBe('50.00');
  });

  it('rejects a retry against an intent that is no longer CREATED (already captured/cancelled)', async () => {
    const { tx, paymentIntents, useCase } = setup();
    paymentIntents.findById.mockResolvedValue({ ...intent, status: 'CAPTURED' });

    await expect(useCase.prepare(tx, { ...baseInput, method: 'CARD', existingPaymentIntentId: 'intent-1' })).rejects.toMatchObject({
      code: 'PAYMENT_INTENT_NOT_RETRYABLE',
    });
  });
});
