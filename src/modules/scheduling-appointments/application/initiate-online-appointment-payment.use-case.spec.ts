import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { InitiateOnlineAppointmentPaymentUseCase } from './initiate-online-appointment-payment.use-case';

function buildTx() {
  return {} as any;
}

describe('InitiateOnlineAppointmentPaymentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const activeHold = { id: 'hold-1', slot_id: 'slot-1', patient_id: 'patient-1', version: 1, status: 'ACTIVE', expires_at: new Date(Date.now() + 5 * 60_000), payment_intent_id: null };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1' };
  const customer = { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com', phone: '+201000000000' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findById: jest.fn(), linkOnlinePayment: jest.fn() };
    const slots = { findById: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const initiatePayment = { execute: jest.fn() };
    const cancelOnlinePayment = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new InitiateOnlineAppointmentPaymentUseCase(
      prisma as any,
      holds as any,
      slots as any,
      affiliationBilling as any,
      initiatePayment as any,
      cancelOnlinePayment as any,
      audit as any,
      outbox as any,
    );
    return { tx, holds, slots, affiliationBilling, initiatePayment, cancelOnlinePayment, audit, outbox, useCase };
  }

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

  it('extends the hold to Fawry\'s 15-minute window and links it to the new PaymentIntent', async () => {
    const { tx, holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    holds.findById.mockResolvedValueOnce(activeHold).mockResolvedValueOnce({ ...activeHold, expires_at: new Date(Date.now() + 15 * 60_000) });
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.execute.mockResolvedValue({ paymentIntentId: 'intent-1', method: 'FAWRY', referenceCode: '123456' });
    holds.linkOnlinePayment.mockResolvedValue(true);

    const result = await useCase.execute('hold-1', { method: 'FAWRY', customer }, actor);

    const linkCall = holds.linkOnlinePayment.mock.calls[0];
    expect(linkCall[0]).toBe(tx);
    expect(linkCall[1]).toBe('hold-1');
    const extendedExpiry = linkCall[4] as Date;
    expect(extendedExpiry.getTime() - activeHold.expires_at.getTime()).toBeGreaterThan(9 * 60_000); // ~10 extra minutes beyond the base 5-min hold

    expect(result).toMatchObject({ paymentIntentId: 'intent-1', method: 'FAWRY', referenceCode: '123456' });
  });

  it('reuses the existing PaymentIntent on retry (hold.payment_intent_id already set) without re-linking the hold', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, useCase } = setup();
    const holdWithIntent = { ...activeHold, payment_intent_id: 'intent-1' };
    holds.findById.mockResolvedValue(holdWithIntent);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.execute.mockResolvedValue({ paymentIntentId: 'intent-1', method: 'CARD', redirectUrl: 'https://accept.paymob.com/iframe/x' });

    await useCase.execute('hold-1', { method: 'CARD', customer }, actor);

    expect(initiatePayment.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ existingPaymentIntentId: 'intent-1' }));
    expect(holds.linkOnlinePayment).not.toHaveBeenCalled();
  });

  it('cancels the freshly-created PaymentIntent and reports HOLD_EXPIRED when linking loses a race against the expiry sweep', async () => {
    const { holds, slots, affiliationBilling, initiatePayment, cancelOnlinePayment, useCase } = setup();
    holds.findById.mockResolvedValue(activeHold);
    slots.findById.mockResolvedValue(slot);
    affiliationBilling.execute.mockResolvedValue(billing);
    initiatePayment.execute.mockResolvedValue({ paymentIntentId: 'intent-1', method: 'MOBILE_WALLET', redirectUrl: 'https://accept.paymob.com/wallet/x' });
    holds.linkOnlinePayment.mockResolvedValue(false);

    await expect(
      useCase.execute('hold-1', { method: 'MOBILE_WALLET', customer, walletProvider: 'VODAFONE_CASH', walletMobileNumber: '+201000000000' }, actor),
    ).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });

    expect(cancelOnlinePayment.execute).toHaveBeenCalledWith(expect.anything(), 'intent-1');
  });
});
