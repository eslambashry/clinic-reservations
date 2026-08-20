import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CancelAppointmentUseCase } from './cancel-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('CancelAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const appointment = { id: 'appointment-1', slot_id: 'slot-1', patient_id: 'patient-1', status: 'CONFIRMED', version: 1 };
  const appointmentWithPayment = { ...appointment, payment_intent_id: 'intent-1' };
  const input = { reason: 'PATIENT_REQUEST' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { findById: jest.fn(), cancel: jest.fn() };
    const slots = { releaseBooked: jest.fn() };
    const policyConfig = { getValue: jest.fn() };
    const refund = { execute: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CancelAppointmentUseCase(
      prisma as any,
      appointments as any,
      slots as any,
      policyConfig as any,
      refund as any,
      audit as any,
      outbox as any,
    );
    return { tx, appointments, slots, policyConfig, refund, audit, outbox, useCase };
  }

  it('404s when the appointment does not exist or belongs to a different patient', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(null);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('422s (APPOINTMENT_NOT_CANCELLABLE) when the appointment is not CONFIRMED', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue({ ...appointment, status: 'CANCELLED' });

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_CANCELLABLE', httpStatus: 422 });
  });

  it('409s (APPOINTMENT_STATE_CHANGED) when the version-guarded cancel loses a concurrent race', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(false);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE_CHANGED', httpStatus: 409 });
  });

  it('cancels, releases the slot, audits, and emits AppointmentCancelled, returning zeroed fee/refund when there is no payment_intent_id', async () => {
    const { tx, appointments, slots, refund, audit, outbox, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    const result = await useCase.execute('appointment-1', input, actor);

    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 0, feeApplied: 0 });
    expect(refund.execute).not.toHaveBeenCalled();
    expect(appointments.cancel).toHaveBeenCalledWith(tx, 'appointment-1', 1, 'patient-1', 'PATIENT_REQUEST');
    expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'slot-1');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.cancel', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentCancelled', expect.objectContaining({ appointmentId: 'appointment-1' }));
  });

  it('reads the CANCELLATION_TIER fee percent and processes a real refund when a payment_intent_id is present', async () => {
    const { tx, appointments, policyConfig, refund, useCase } = setup();
    appointments.findById.mockResolvedValue(appointmentWithPayment);
    appointments.cancel.mockResolvedValue(true);
    policyConfig.getValue.mockResolvedValue({ feePercent: 10 });
    refund.execute.mockResolvedValue({ refundAmount: '180.00', feeApplied: '20.00' });

    const result = await useCase.execute('appointment-1', input, actor);

    expect(policyConfig.getValue).toHaveBeenCalledWith(tx, 'EG', 'CANCELLATION_TIER');
    expect(refund.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', feePercent: 10 });
    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 180, feeApplied: 20 });
  });

  it('bypasses the CANCELLATION_TIER read entirely and always uses feePercent 0 for a provider-initiated cancellation', async () => {
    const { tx, appointments, policyConfig, refund, useCase } = setup();
    appointments.findById.mockResolvedValue(appointmentWithPayment);
    appointments.cancel.mockResolvedValue(true);
    refund.execute.mockResolvedValue({ refundAmount: '200.00', feeApplied: '0.00' });

    const result = await useCase.execute('appointment-1', { reason: 'PROVIDER_REQUEST' }, actor);

    expect(policyConfig.getValue).not.toHaveBeenCalled();
    expect(refund.execute).toHaveBeenCalledWith(tx, { paymentIntentId: 'intent-1', feePercent: 0 });
    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 200, feeApplied: 0 });
  });

  it('folds an optional note into the persisted cancelled_reason', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    await useCase.execute('appointment-1', { reason: 'OTHER', note: 'doctor unavailable' }, actor);

    expect(appointments.cancel).toHaveBeenCalledWith(expect.anything(), 'appointment-1', 1, 'patient-1', 'OTHER: doctor unavailable');
  });
});
