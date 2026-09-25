import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { InitiateOnlineAppointmentPaymentUseCase } from './initiate-online-appointment-payment.use-case';
import { ResolveAppointmentPaymentAmountUseCase } from './resolve-appointment-payment-amount.use-case';

function buildTx() {
  return {} as any;
}

describe('InitiateOnlineAppointmentPaymentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const activeHold = { id: 'hold-1', slot_id: 'slot-1', patient_id: 'patient-1', version: 1, status: 'ACTIVE', expires_at: new Date(Date.now() + 5 * 60_000), payment_intent_id: null };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1' };
  const customer = { phone: '+201000000000' };
  const billingData = { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com' };
  const gatewayCustomer = { ...billingData, ...customer };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findById: jest.fn(), linkOnlinePayment: jest.fn() };
    const slots = { findById: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const initiatePayment = { prepare: jest.fn(), callGateway: jest.fn(), completeSuccess: jest.fn(), completeFailure: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const policyConfig = { getValue: jest.fn().mockResolvedValue({ minAmount: '50.00' }) };
    const resolvePaymentAmount = new ResolveAppointmentPaymentAmountUseCase(policyConfig as any);
    const useCase = new InitiateOnlineAppointmentPaymentUseCase(
      prisma as any,
      holds as any,
      slots as any,
      affiliationBilling as any,
      initiatePayment as any,
      audit as any,
      outbox as any,
      resolvePaymentAmount,
    );
    return { tx, prisma, holds, slots, affiliationBilling, initiatePayment, audit, outbox, policyConfig, useCase };
  }

  describe('partial payment amount', () => {
    function arrange() {
      const s = setup();
      s.holds.findById.mockResolvedValue(activeHold);
      s.slots.findById.mockResolvedValue(slot);
      s.affiliationBilling.execute.mockResolvedValue({ ...billing, consultFee: '300.00' });
      s.initiatePayment.prepare.mockImplementation(async (_tx: any, input: any) => ({
        paymentIntentId: 'intent-1',
        paymentAttemptId: 'attempt-1',
        method: input.method,
        gatewayInput: { merchantReference: 'attempt-1', amount: input.amount, currency: 'EGP', customer: input.customer, expiresAt: input.expiresAt },
      }));
      s.holds.linkOnlinePayment.mockResolvedValue(true);
      s.initiatePayment.callGateway.mockResolvedValue({ metadata: {}, referenceCode: '123456' });
      return s;
    }

    it.each([['50.00'], ['100'], ['299.99'], ['300.00']])('accepts %s and charges exactly that, with the full fee snapshotted', async (paymentAmount) => {
      const { initiatePayment, useCase } = arrange();

      await useCase.execute('hold-1', { method: 'CARD', customer, billingData, paymentAmount }, actor);

      const prepareInput = initiatePayment.prepare.mock.calls[0][1];
      expect(Number(prepareInput.amount)).toBe(Number(paymentAmount));
      expect(prepareInput.fullAmount).toBe('300.00');
    });

    it('defaults to the full fee when no amount is sent — the pre-existing behavior', async () => {
      const { initiatePayment, policyConfig, useCase } = arrange();

      await useCase.execute('hold-1', { method: 'FAWRY', customer }, actor);

      expect(initiatePayment.prepare.mock.calls[0][1]).toMatchObject({ amount: '300.00', fullAmount: '300.00' });
      expect(policyConfig.getValue).not.toHaveBeenCalled();
    });

    it('strips billing name and email from Fawry gateway input even if a caller includes billingData', async () => {
      const { initiatePayment, useCase } = arrange();

      await useCase.execute('hold-1', { method: 'FAWRY', customer, billingData }, actor);

      expect(initiatePayment.prepare.mock.calls[0][1].customer).toEqual({
        firstName: '',
        lastName: '',
        email: '',
        phone: customer.phone,
      });
    });

    it.each([
      ['49.99', 'PAYMENT_AMOUNT_BELOW_MINIMUM'],
      ['0', 'PAYMENT_AMOUNT_INVALID'],
      ['0.00', 'PAYMENT_AMOUNT_INVALID'],
      ['-50', 'PAYMENT_AMOUNT_INVALID'],
      ['abc', 'PAYMENT_AMOUNT_INVALID'],
      ['300.01', 'PAYMENT_AMOUNT_EXCEEDS_FEE'],
      ['301', 'PAYMENT_AMOUNT_EXCEEDS_FEE'],
    ])('rejects %s with %s and never reaches the gateway', async (paymentAmount, code) => {
      const { initiatePayment, useCase } = arrange();

      await expect(useCase.execute('hold-1', { method: 'CARD', customer, billingData, paymentAmount }, actor)).rejects.toMatchObject({ code });
      expect(initiatePayment.callGateway).not.toHaveBeenCalled();
    });

    it('caps the minimum at the fee itself for a doctor cheaper than the minimum', async () => {
      const { affiliationBilling, initiatePayment, useCase } = arrange();
      affiliationBilling.execute.mockResolvedValue({ ...billing, consultFee: '40.00' });

      await useCase.execute('hold-1', { method: 'CARD', customer, billingData, paymentAmount: '40.00' }, actor);
      expect(initiatePayment.prepare.mock.calls[0][1]).toMatchObject({ amount: '40.00', fullAmount: '40.00' });

      await expect(useCase.execute('hold-1', { method: 'CARD', customer, billingData, paymentAmount: '39.99' }, actor)).rejects.toMatchObject({
        code: 'PAYMENT_AMOUNT_BELOW_MINIMUM',
      });
    });

    it('never trusts a client-supplied fee or remaining balance — extra body fields are simply not read', async () => {
      const { initiatePayment, useCase } = arrange();

      await useCase.execute('hold-1', { method: 'CARD', customer, billingData, paymentAmount: '100', consultFee: '1', remainingBalance: '0' } as any, actor);

      expect(initiatePayment.prepare.mock.calls[0][1].fullAmount).toBe('300.00');
    });
  });

  it('404s when the hold does not exist or belongs to another patient', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('hold-1', { method: 'FAWRY', customer }, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('410s for an already-expired or already-converted hold', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue({ ...activeHold, status: 'EXPIRED' });

    await expect(useCase.execute('hold-1', { method: 'FAWRY', customer }, actor)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
  });

  it('extends the hold to Fawry\'s 15-minute window, links it to the new PaymentIntent, and calls the gateway AFTER the DB transaction commits', async () => {
    const { tx, holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValue(activeHold);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'FAWRY',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: new Date() },
    });
    holds.linkOnlinePayment.mockResolvedValue(true);
    initiatePayment.callGateway.mockResolvedValue({ metadata: {}, referenceCode: '123456' });

    const result = await useCase.execute('hold-1', { method: 'FAWRY', customer }, actor);

    const linkCall = holds.linkOnlinePayment.mock.calls[0];
    expect(linkCall[0]).toBe(tx);
    expect(linkCall[1]).toBe('hold-1');
    const extendedExpiry = linkCall[4] as Date;
    expect(extendedExpiry.getTime() - activeHold.expires_at.getTime()).toBeGreaterThan(9 * 60_000); // ~10 extra minutes beyond the base 5-min hold

    // The gateway call must happen after prepare()'s transaction has already
    // been invoked, and completeSuccess in a separate transaction call.
    expect(initiatePayment.callGateway).toHaveBeenCalled();
    expect(initiatePayment.completeSuccess).toHaveBeenCalledWith(tx, 'attempt-1', {});
    expect(result).toMatchObject({ paymentIntentId: 'intent-1', method: 'FAWRY', referenceCode: '123456' });
  });

  it('computes expiresAt once and reuses the exact same value for both the gateway call and the hold link (File 12 Part 51)', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValue(activeHold);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockImplementation(async (_tx: any, input: any) => ({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'FAWRY',
      gatewayInput: { merchantReference: 'attempt-1', amount: input.amount, currency: input.currency, customer: gatewayCustomer, expiresAt: input.expiresAt },
    }));
    holds.linkOnlinePayment.mockResolvedValue(true);
    initiatePayment.callGateway.mockResolvedValue({ metadata: {}, referenceCode: '123456' });

    await useCase.execute('hold-1', { method: 'FAWRY', customer }, actor);

    const prepareCallExpiresAt = initiatePayment.prepare.mock.calls[0][1].expiresAt as Date;
    const linkCallExpiresAt = holds.linkOnlinePayment.mock.calls[0][4] as Date;
    expect(prepareCallExpiresAt.getTime()).toBe(linkCallExpiresAt.getTime());
  });

  it('on retry, reuses the hold\'s EXISTING expires_at as the gateway expiresAt rather than recalculating a fresh one', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    const originalExpiry = new Date(Date.now() + 12 * 60_000);
    const holdWithIntent = { ...activeHold, payment_intent_id: 'intent-1', expires_at: originalExpiry };
    holds.findById.mockResolvedValue(holdWithIntent);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'FAWRY',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: originalExpiry },
    });
    initiatePayment.callGateway.mockResolvedValue({ metadata: {}, referenceCode: '123456' });

    await useCase.execute('hold-1', { method: 'FAWRY', customer }, actor);

    const prepareCallExpiresAt = initiatePayment.prepare.mock.calls[0][1].expiresAt as Date;
    expect(prepareCallExpiresAt.getTime()).toBe(originalExpiry.getTime());
  });

  it('echoes the amount the gateway will charge — the stored one on a retry, not the one sent again', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValue({ ...activeHold, payment_intent_id: 'intent-1' });
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'FAWRY',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: new Date() },
    });
    initiatePayment.callGateway.mockResolvedValue({ metadata: {}, referenceCode: '123456' });

    const result = await useCase.execute('hold-1', { method: 'FAWRY', customer, paymentAmount: '100.00' }, actor);

    expect(result).toMatchObject({ amount: '200.00', currency: 'EGP', referenceCode: '123456' });
  });

  it('reuses the existing PaymentIntent on retry (hold.payment_intent_id already set) without re-linking the hold', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    const holdWithIntent = { ...activeHold, payment_intent_id: 'intent-1' };
    holds.findById.mockResolvedValue(holdWithIntent);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'CARD',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: new Date() },
    });
    initiatePayment.callGateway.mockResolvedValue({ metadata: {}, redirectUrl: 'https://accept.paymob.com/iframe/x' });

    await useCase.execute('hold-1', { method: 'CARD', customer, billingData }, actor);

    expect(initiatePayment.prepare).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ existingPaymentIntentId: 'intent-1' }));
    expect(holds.linkOnlinePayment).not.toHaveBeenCalled();
  });

  it('rolls back (via the prepare transaction throwing) and reports HOLD_EXPIRED when linking loses a race against the expiry sweep — never calling the gateway', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValue(activeHold);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'MOBILE_WALLET',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: new Date() },
    });
    holds.linkOnlinePayment.mockResolvedValue(false);

    await expect(
      useCase.execute('hold-1', { method: 'MOBILE_WALLET', customer, billingData, walletProvider: 'VODAFONE_CASH', walletMobileNumber: '+201000000000' }, actor),
    ).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });

    expect(initiatePayment.callGateway).not.toHaveBeenCalled();
  });

  it('marks the attempt FAILED and rethrows when the gateway call fails, without touching the hold/intent that already committed', async () => {
    const { tx, holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValue(activeHold);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.prepare.mockResolvedValue({
      paymentIntentId: 'intent-1',
      paymentAttemptId: 'attempt-1',
      method: 'FAWRY',
      gatewayInput: { merchantReference: 'attempt-1', amount: '200.00', currency: 'EGP', customer: gatewayCustomer, expiresAt: new Date() },
    });
    holds.linkOnlinePayment.mockResolvedValue(true);
    initiatePayment.callGateway.mockRejectedValue(new Error('gateway timeout'));

    await expect(useCase.execute('hold-1', { method: 'FAWRY', customer }, actor)).rejects.toThrow('gateway timeout');

    expect(initiatePayment.completeFailure).toHaveBeenCalledWith(tx, 'attempt-1');
  });
});
