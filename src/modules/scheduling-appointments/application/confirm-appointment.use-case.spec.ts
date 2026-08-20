import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { ConfirmAppointmentUseCase } from './confirm-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('ConfirmAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const hold = { id: 'hold-1', slot_id: 'slot-1', patient_id: 'patient-1', version: 1 };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1' };
  const billing = { consultFee: '200.00', currency: 'EGP', doctorId: 'doctor-1' };
  const payAtClinic = { paymentMethod: 'PAY_AT_CLINIC' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const holds = { findById: jest.fn(), markConverted: jest.fn() };
    const slots = { findById: jest.fn(), markBooked: jest.fn() };
    const appointments = { create: jest.fn() };
    const affiliationBilling = { execute: jest.fn() };
    const paymentsCapture = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new ConfirmAppointmentUseCase(
      prisma as any,
      holds as any,
      slots as any,
      appointments as any,
      affiliationBilling as any,
      paymentsCapture as any,
      audit as any,
      outbox as any,
    );
    return { tx, prisma, holds, slots, appointments, affiliationBilling, paymentsCapture, audit, outbox, useCase };
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
  });
});
