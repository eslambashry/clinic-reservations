import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { RescheduleAppointmentUseCase } from './reschedule-appointment.use-case';

function buildTx() {
  return {} as any;
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
}

describe('RescheduleAppointmentUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const appointment = {
    id: 'appointment-1',
    slot_id: 'old-slot',
    patient_id: 'patient-1',
    doctor_clinic_affiliation_id: 'aff-1',
    status: 'CONFIRMED',
    version: 1,
  };
  const newSlot = { id: 'new-slot', doctor_clinic_affiliation_id: 'aff-1', status: 'OPEN' };
  const input = { newSlotId: 'new-slot' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const appointments = { findById: jest.fn(), markRescheduled: jest.fn() };
    const slots = { findById: jest.fn(), releaseBooked: jest.fn(), markHeld: jest.fn() };
    const holds = { create: jest.fn() };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };
    const appointmentScope = { execute: jest.fn().mockResolvedValue({ kind: 'PATIENT', patientUserId: 'patient-1' }) };
    const useCase = new RescheduleAppointmentUseCase(
      prisma as any,
      appointments as any,
      slots as any,
      holds as any,
      audit as any,
      outbox as any,
      appointmentScope as any,
    );
    return { tx, appointments, slots, holds, audit, outbox, appointmentScope, useCase };
  }

  it('404s when the appointment does not exist or belongs to a different patient', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue(null);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('422s (APPOINTMENT_NOT_RESCHEDULABLE) when the appointment is not CONFIRMED', async () => {
    const { appointments, useCase } = setup();
    appointments.findById.mockResolvedValue({ ...appointment, status: 'CANCELLED' });

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_RESCHEDULABLE', httpStatus: 422 });
  });

  it('404s when the new slot belongs to a different affiliation (Part 35.11)', async () => {
    const { appointments, slots, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    slots.findById.mockResolvedValue({ ...newSlot, doctor_clinic_affiliation_id: 'other-aff' });

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s (APPOINTMENT_STATE_CHANGED) when the version-guarded reschedule loses a concurrent race', async () => {
    const { appointments, slots, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    slots.findById.mockResolvedValue(newSlot);
    appointments.markRescheduled.mockResolvedValue(false);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'APPOINTMENT_STATE_CHANGED', httpStatus: 409 });
  });

  it('409s (SLOT_ALREADY_BOOKED) when the new slot is no longer OPEN', async () => {
    const { appointments, slots, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    slots.findById.mockResolvedValue(newSlot);
    appointments.markRescheduled.mockResolvedValue(true);
    slots.markHeld.mockResolvedValue(false);

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_BOOKED', httpStatus: 409 });
  });

  it('409s (SLOT_ALREADY_HELD) when the new hold insert violates the partial unique index', async () => {
    const { appointments, slots, holds, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    slots.findById.mockResolvedValue(newSlot);
    appointments.markRescheduled.mockResolvedValue(true);
    slots.markHeld.mockResolvedValue(true);
    holds.create.mockRejectedValue(uniqueViolation());

    await expect(useCase.execute('appointment-1', input, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_HELD', httpStatus: 409 });
  });

  it('releases the old slot, claims the new one, creates a linked hold, audits, and emits AppointmentHeld', async () => {
    const { tx, appointments, slots, holds, audit, outbox, useCase } = setup();
    appointments.findById.mockResolvedValue(appointment);
    slots.findById.mockResolvedValue(newSlot);
    appointments.markRescheduled.mockResolvedValue(true);
    slots.markHeld.mockResolvedValue(true);
    holds.create.mockResolvedValue({ id: 'hold-2' });

    const result = await useCase.execute('appointment-1', input, actor);

    expect(result).toMatchObject({ holdId: 'hold-2', slotId: 'new-slot', status: 'HELD', previousAppointmentId: 'appointment-1' });
    expect(appointments.markRescheduled).toHaveBeenCalledWith(tx, 'appointment-1', 1);
    expect(slots.releaseBooked).toHaveBeenCalledWith(tx, 'old-slot');
    expect(slots.markHeld).toHaveBeenCalledWith(tx, 'new-slot');
    expect(holds.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ slotId: 'new-slot', patientId: 'patient-1', rescheduledFromAppointmentId: 'appointment-1' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorUserId: 'patient-1', action: 'scheduling_appointments.appointment.reschedule', resourceId: 'appointment-1' }),
    );
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentHeld', expect.objectContaining({ holdId: 'hold-2', rescheduledFromAppointmentId: 'appointment-1' }));
  });
});
