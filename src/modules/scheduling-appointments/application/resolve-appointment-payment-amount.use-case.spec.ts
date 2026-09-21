import { ResolveAppointmentPaymentAmountUseCase } from './resolve-appointment-payment-amount.use-case';

describe('ResolveAppointmentPaymentAmountUseCase', () => {
  const tx = {} as any;

  function setup(policyValue: unknown) {
    const policyConfig = { getValue: jest.fn().mockResolvedValue(policyValue) };
    return { policyConfig, useCase: new ResolveAppointmentPaymentAmountUseCase(policyConfig as any) };
  }

  describe('minimum-payment policy', () => {
    it('accepts a valid "50.00" policy and enforces it', async () => {
      const { useCase } = setup({ minAmount: '50.00' });

      await expect(useCase.execute(tx, { requestedAmount: '50.00', consultFee: '300.00' })).resolves.toEqual({
        paymentAmount: '50.00',
        fullAmount: '300.00',
        remainingBalance: '250.00',
      });
      await expect(useCase.execute(tx, { requestedAmount: '49.99', consultFee: '300.00' })).rejects.toMatchObject({
        code: 'PAYMENT_AMOUNT_BELOW_MINIMUM',
      });
    });

    it.each([
      ['policy row missing', null],
      ['minAmount missing', {}],
      ['minAmount undefined', { minAmount: undefined }],
      ['minAmount "abc"', { minAmount: 'abc' }],
      ['minAmount "0"', { minAmount: '0' }],
      ['minAmount "0.00"', { minAmount: '0.00' }],
      ['minAmount negative', { minAmount: '-50.00' }],
      ['minAmount a number, not a string', { minAmount: 50 }],
      ['minAmount with 3 decimals', { minAmount: '50.005' }],
      ['minAmount empty', { minAmount: '' }],
    ])('fails safely with MIN_APPOINTMENT_PAYMENT_NOT_CONFIGURED when %s — never silently skips the minimum', async (_label, policyValue) => {
      const { useCase } = setup(policyValue);

      await expect(useCase.execute(tx, { requestedAmount: '1.00', consultFee: '300.00' })).rejects.toMatchObject({
        code: 'MIN_APPOINTMENT_PAYMENT_NOT_CONFIGURED',
      });
    });
  });

  it('paying in full (no amount) never reads the policy, so a broken policy cannot block full payments', async () => {
    const { policyConfig, useCase } = setup({ minAmount: 'abc' });

    await expect(useCase.execute(tx, { consultFee: '300.00' })).resolves.toEqual({
      paymentAmount: '300.00',
      fullAmount: '300.00',
      remainingBalance: '0.00',
    });
    expect(policyConfig.getValue).not.toHaveBeenCalled();
  });

  it('caps the minimum at the fee: a 40 EGP fee is payable as 40', async () => {
    const { useCase } = setup({ minAmount: '50.00' });

    await expect(useCase.execute(tx, { requestedAmount: '40.00', consultFee: '40.00' })).resolves.toMatchObject({ paymentAmount: '40.00', remainingBalance: '0.00' });
  });
});
