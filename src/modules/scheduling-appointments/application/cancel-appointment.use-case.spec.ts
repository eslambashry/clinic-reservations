import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CancelAppointmentUseCase } from './cancel-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('CancelAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const appointment = { id: 'appointment-1', slot_id: 'slot-1', patient_id: 'patient-1', status: 'CONFIRMED', version: 1 };
  const input = { reason: 'PATIENT_REQUEST' as const };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { findById: jest.fn(), cancel: jest.fn() };
    const slots = { releaseBooked: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const useCase = new CancelAppointmentUseCase(prisma as any, appointments as any, slots as any, audit as any, outbox as any);
    return { tx, appointments, slots, audit, outbox, useCase };
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

  it('cancels, releases the slot, audits, and emits AppointmentCancelled, returning zeroed fee/refund', async () => {
    const { tx, appointments, slots, audit, outbox, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    const result = await useCase.execute('appointment-1', input, actor);

    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 0, feeApplied: 0 });
    expect(appointments.cancel).toHaveBeenCalledWith(tx, 'appointment-1', 1, 'patient-1', 'PATIENT_REQUEST');
    expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'slot-1');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.cancel', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentCancelled', expect.objectContaining({ appointmentId: 'appointment-1' }));
  });

  it('folds an optional note into the persisted cancelled_reason', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    appointments.cancel.mockResolvedValue(true);

    await useCase.execute('appointment-1', { reason: 'OTHER', note: 'doctor unavailable' }, actor);

    expect(appointments.cancel).toHaveBeenCalledWith(expect.anything(), 'appointment-1', 1, 'patient-1', 'OTHER: doctor unavailable');
  });
});
