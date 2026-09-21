import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ConfirmAppointmentUseCase } from './confirm-appointment.use-case';
import { ResolveAppointmentPaymentAmountUseCase } from './resolve-appointment-payment-amount.use-case';

function buildTx() {
  return {} as any;
}

describe('ConfirmAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const hold = { id: 'hold-1', slot_id: 'slot-1', patient_id: 'patient-1', version: 1 };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1', doctorUserId: 'doctor-user-1', clinicBranchId: 'branch-1' };
  const payAtClinic = { paymentMethod: 'PAY_AT_CLINIC' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findById: jest.fn(), markConverted: jest.fn() };
    const slots = { findById: jest.fn(), markBooked: jest.fn() };
    const appointments = { create: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const paymentsCapture = { execute: jest.fn() };
    const walletCapture = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const assistantUserIds = { execute: jest.fn().mockResolvedValue([]) };
    const policyConfig = { getValue: jest.fn().mockResolvedValue({ minAmount: '50.00' }) };
    const resolvePaymentAmount = new ResolveAppointmentPaymentAmountUseCase(policyConfig as any);
    const useCase = new ConfirmAppointmentUseCase(
      prisma as any,
      holds as any,
      slots as any,
      appointments as any,
      affiliationBilling as any,
      paymentsCapture as any,
      walletCapture as any,
      audit as any,
      outbox as any,
      assistantUserIds as any,
      resolvePaymentAmount,
    );
    return { tx, prisma, holds, slots, appointments, affiliationBilling, paymentsCapture, walletCapture, audit, outbox, assistantUserIds, policyConfig, useCase };
  }

  it('rejects ONLINE payment as not yet supported, before touching the database', async () => {
    const { prisma, useCase } = setup();

    await expect(useCase.execute('hold-1', { paymentMethod: 'ONLINE' }, actor)).rejects.toMatchObject({ code: 'PAYMENT_METHOD_NOT_SUPPORTED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s when the hold does not exist or belongs to a different patient', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue(null);

    await expect(useCase.execute('hold-1', payAtClinic, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('translates an expired/already-converted hold into 410 HOLD_EXPIRED', async () => {
    const { holds, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockRejectedValue(new OptimisticLockError('hold-1', 1));

    await expect(useCase.execute('hold-1', payAtClinic, actor)).rejects.toMatchObject({ code: 'HOLD_EXPIRED', httpStatus: 410 });
  });

  it('confirms the appointment, captures a pay-at-clinic payment, audits it, and emits AppointmentConfirmed in the same transaction', async () => {
    const { tx, holds, slots, appointments, affiliationBilling, paymentsCapture, audit, outbox, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockResolvedValue(undefined);
    slots.findById.mockResolvedValue(slot);
    slots.markBooked.mockResolvedValue(true);
    affiliationBilling.execute.mockResolvedValue(billing);
    paymentsCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00' });
    appointments.create.mockResolvedValue({ id: 'appointment-1' });

    const result = await useCase.execute('hold-1', payAtClinic, actor);

    expect(result).toEqual({ appointmentId: 'appointment-1', status: 'CONFIRMED' });
    expect(affiliationBilling.execute).toHaveBeenCalledWith(tx, 'aff-1');

    const captureCall = paymentsCapture.execute.mock.calls[0];
    expect(captureCall[0]).toBe(tx);
    expect(captureCall[1]).toMatchObject({
      payerUserId: 'patient-1',
      payableType: 'APPOINTMENT',
      amount: '200.00',
      currency: 'EGP',
      providerType: 'DOCTOR',
      providerId: 'doctor-1',
      idempotencyKey: 'hold:hold-1',
    });
    // The pre-generated appointment id used as PaymentIntent.payable_id must be the same UUID appointments.create receives.
    const generatedAppointmentId = captureCall[1].payableId;
    expect(typeof generatedAppointmentId).toBe('string');

    expect(appointments.create).toHaveBeenCalledWith(tx, {
      id: generatedAppointmentId,
      slotId: 'slot-1',
      patientId: 'patient-1',
      doctorClinicAffiliationId: 'aff-1',
      rescheduledFromAppointmentId: undefined,
      paymentIntentId: 'intent-1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.confirm', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentConfirmed', expect.objectContaining({ appointmentId: 'appointment-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForDoctor',
      expect.objectContaining({ appointmentId: 'appointment-1', doctorUserId: 'doctor-user-1' }),
    );
  });

  it('notifies every assistant assigned to the appointment branch, scoped to that branch only', async () => {
    const { tx, holds, slots, appointments, affiliationBilling, paymentsCapture, outbox, assistantUserIds, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockResolvedValue(undefined);
    slots.findById.mockResolvedValue(slot);
    slots.markBooked.mockResolvedValue(true);
    affiliationBilling.execute.mockResolvedValue(billing);
    paymentsCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-1', commissionAmount: '30.00', providerAmount: '170.00' });
    appointments.create.mockResolvedValue({ id: 'appointment-1' });
    assistantUserIds.execute.mockResolvedValue(['assistant-1', 'assistant-2']);

    await useCase.execute('hold-1', payAtClinic, actor);

    expect(assistantUserIds.execute).toHaveBeenCalledWith(tx, 'branch-1');
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'NewAppointmentBookedForAssistant',
      expect.objectContaining({ appointmentId: 'appointment-1', assistantUserId: 'assistant-2' }),
    );
  });

  it('emits AppointmentRescheduledForDoctor instead of NewAppointmentBookedForDoctor when the hold carries rescheduledFromAppointmentId', async () => {
    const { tx, holds, slots, appointments, affiliationBilling, paymentsCapture, outbox, useCase } = setup();
    const rescheduleHold = { ...hold, rescheduled_from_appointment_id: 'appointment-old' };
    holds.findById.mockResolvedValue(rescheduleHold);
    holds.markConverted.mockResolvedValue(undefined);
    slots.findById.mockResolvedValue(slot);
    slots.markBooked.mockResolvedValue(true);
    affiliationBilling.execute.mockResolvedValue(billing);
    paymentsCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-3', commissionAmount: '30.00', providerAmount: '170.00' });
    appointments.create.mockResolvedValue({ id: 'appointment-3' });

    await useCase.execute('hold-1', payAtClinic, actor);

    expect(outbox.emit).toHaveBeenCalledWith(
      tx,
      'AppointmentRescheduledForDoctor',
      expect.objectContaining({ appointmentId: 'appointment-3', doctorUserId: 'doctor-user-1' }),
    );
    expect(outbox.emit).not.toHaveBeenCalledWith(tx, 'NewAppointmentBookedForDoctor', expect.anything());
  });

  it('confirms via CaptureInternalWalletPaymentUseCase (not the pay-at-clinic path) for paymentMethod=INTERNAL_WALLET', async () => {
    const { holds, slots, appointments, affiliationBilling, paymentsCapture, walletCapture, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockResolvedValue(undefined);
    slots.findById.mockResolvedValue(slot);
    slots.markBooked.mockResolvedValue(true);
    affiliationBilling.execute.mockResolvedValue(billing);
    walletCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-2', commissionAmount: '30.00', providerAmount: '170.00', newWalletBalance: '300.00' });
    appointments.create.mockResolvedValue({ id: 'appointment-2' });

    const result = await useCase.execute('hold-1', { paymentMethod: 'INTERNAL_WALLET' }, actor);

    expect(result).toEqual({ appointmentId: 'appointment-2', status: 'CONFIRMED' });
    expect(walletCapture.execute).toHaveBeenCalled();
    expect(paymentsCapture.execute).not.toHaveBeenCalled();
  });

  describe('partial payment (INTERNAL_WALLET)', () => {
    function arrange() {
      const s = setup();
      s.holds.findById.mockResolvedValue(hold);
      s.holds.markConverted.mockResolvedValue(undefined);
      s.slots.findById.mockResolvedValue(slot);
      s.slots.markBooked.mockResolvedValue(true);
      s.affiliationBilling.execute.mockResolvedValue(billing);
      s.walletCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-w', commissionAmount: '7.50', providerAmount: '42.50', newWalletBalance: '1.00' });
      s.appointments.create.mockResolvedValue({ id: 'appointment-w' });
      return s;
    }

    it('debits only the chosen amount, stores the full fee on the intent, and records the remaining balance', async () => {
      const { tx, walletCapture, appointments, useCase } = arrange();

      await useCase.execute('hold-1', { paymentMethod: 'INTERNAL_WALLET', paymentAmount: '50.00' }, actor);

      expect(walletCapture.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '50.00', fullAmount: '200.00' }));
      expect(appointments.create).toHaveBeenCalledWith(tx, expect.objectContaining({ remainingBalance: '150.00' }));
    });

    it('pays in full with remaining_balance 0.00 when no amount is sent', async () => {
      const { tx, walletCapture, appointments, useCase } = arrange();

      await useCase.execute('hold-1', { paymentMethod: 'INTERNAL_WALLET' }, actor);

      expect(walletCapture.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '200.00', fullAmount: '200.00' }));
      expect(appointments.create).toHaveBeenCalledWith(tx, expect.objectContaining({ remainingBalance: '0.00' }));
    });

    it.each([
      ['49.99', 'PAYMENT_AMOUNT_BELOW_MINIMUM'],
      ['0', 'PAYMENT_AMOUNT_INVALID'],
      ['-10', 'PAYMENT_AMOUNT_INVALID'],
      ['200.01', 'PAYMENT_AMOUNT_EXCEEDS_FEE'],
    ])('rejects %s with %s before any wallet debit', async (paymentAmount, code) => {
      const { walletCapture, appointments, useCase } = arrange();

      await expect(useCase.execute('hold-1', { paymentMethod: 'INTERNAL_WALLET', paymentAmount }, actor)).rejects.toMatchObject({ code });
      expect(walletCapture.execute).not.toHaveBeenCalled();
      expect(appointments.create).not.toHaveBeenCalled();
    });

    it('rejects a paymentAmount on PAY_AT_CLINIC — that flow is unchanged', async () => {
      const { paymentsCapture, useCase } = arrange();

      await expect(useCase.execute('hold-1', { paymentMethod: 'PAY_AT_CLINIC', paymentAmount: '50.00' }, actor)).rejects.toMatchObject({
        code: 'PAYMENT_AMOUNT_NOT_SUPPORTED',
      });
      expect(paymentsCapture.execute).not.toHaveBeenCalled();
    });

    it('leaves PAY_AT_CLINIC untouched: full fee captured, no remaining_balance set', async () => {
      const { tx, paymentsCapture, appointments, useCase } = arrange();
      paymentsCapture.execute.mockResolvedValue({ paymentIntentId: 'intent-p', commissionAmount: '30.00', providerAmount: '170.00' });

      await useCase.execute('hold-1', payAtClinic, actor);

      expect(paymentsCapture.execute).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '200.00' }));
      expect(appointments.create).toHaveBeenCalledWith(tx, expect.objectContaining({ remainingBalance: undefined }));
    });
  });

  it('surfaces INSUFFICIENT_WALLET_BALANCE from CaptureInternalWalletPaymentUseCase without creating the appointment', async () => {
    const { holds, slots, appointments, affiliationBilling, walletCapture, useCase } = setup();
    holds.findById.mockResolvedValue(hold);
    holds.markConverted.mockResolvedValue(undefined);
    slots.findById.mockResolvedValue(slot);
    slots.markBooked.mockResolvedValue(true);
    affiliationBilling.execute.mockResolvedValue(billing);
    walletCapture.execute.mockRejectedValue(Object.assign(new Error('insufficient'), { code: 'INSUFFICIENT_WALLET_BALANCE', httpStatus: 422 }));

    await expect(useCase.execute('hold-1', { paymentMethod: 'INTERNAL_WALLET' }, actor)).rejects.toMatchObject({
      code: 'INSUFFICIENT_WALLET_BALANCE',
    });
    expect(appointments.create).not.toHaveBeenCalled();
  });
});
