import { FindPaymentByGatewayReferenceUseCase } from './find-payment-by-gateway-reference.use-case';

describe('FindPaymentByGatewayReferenceUseCase', () => {
  const tx = {} as any;
  const attempt = { id: 'attempt-uuid', payment_intent_id: 'intent-1' };
  const intent = {
    id: 'intent-1',
    payer_user_id: 'patient-1',
    payable_type: 'APPOINTMENT',
    payable_id: 'appointment-1',
    status: 'CREATED',
    method: 'MOBILE_WALLET',
    amount: { toString: () => '150.00' },
    full_amount: null,
    currency: 'EGP',
  };

  function setup() {
    const paymentAttempts = {
      findByGatewayReference: jest.fn().mockResolvedValue(attempt),
      findByFawryMerchantRefNum: jest.fn().mockResolvedValue(attempt),
    };
    const paymentIntents = { findById: jest.fn().mockResolvedValue(intent) };
    const useCase = new FindPaymentByGatewayReferenceUseCase(paymentAttempts as any, paymentIntents as any);
    return { paymentAttempts, useCase };
  }

  it('resolves a numeric Fawry merchantRefNumber through fawry_merchant_ref_num', async () => {
    const { paymentAttempts, useCase } = setup();

    const result = await useCase.execute(tx, '4242', 'fawry');

    expect(paymentAttempts.findByFawryMerchantRefNum).toHaveBeenCalledWith(tx, BigInt(4242));
    expect(paymentAttempts.findByGatewayReference).not.toHaveBeenCalled();
    expect(result).toMatchObject({ paymentAttemptId: 'attempt-uuid', paymentIntentId: 'intent-1', method: 'MOBILE_WALLET', amount: '150.00' });
  });

  it('falls back to gateway_reference for a legacy Fawry attempt that was sent its UUID before File 12 Part 55', async () => {
    const { paymentAttempts, useCase } = setup();

    await useCase.execute(tx, '3f1c2a4e-0000-4000-8000-000000000000', 'fawry');

    expect(paymentAttempts.findByGatewayReference).toHaveBeenCalledWith(tx, '3f1c2a4e-0000-4000-8000-000000000000');
    expect(paymentAttempts.findByFawryMerchantRefNum).not.toHaveBeenCalled();
  });

  it('always uses gateway_reference for Paymob, even for an all-digit reference', async () => {
    const { paymentAttempts, useCase } = setup();

    await useCase.execute(tx, '4242', 'paymob');

    expect(paymentAttempts.findByGatewayReference).toHaveBeenCalledWith(tx, '4242');
    expect(paymentAttempts.findByFawryMerchantRefNum).not.toHaveBeenCalled();
  });

  it('returns null when no attempt matches', async () => {
    const { paymentAttempts, useCase } = setup();
    paymentAttempts.findByFawryMerchantRefNum.mockResolvedValue(null);

    await expect(useCase.execute(tx, '9999', 'fawry')).resolves.toBeNull();
  });
});
