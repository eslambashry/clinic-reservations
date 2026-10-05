import { Appointment, Prisma } from '@prisma/client';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { canChangeBooking, isBeforeAppointmentStart } from '../domain/visit-status.rules';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';
import { AppointmentScope } from './resolve-appointment-scope.use-case';

/**
 * The approved booking-change rules shared by cancel and reschedule, for an
 * appointment the caller already checked is `CONFIRMED` and in scope:
 *
 * - PM-APPT-02: every actor is blocked once the visit has started
 *   (`IN_DOCTOR_ROOM`/`LEFT`) or otherwise ended.
 * - PM-APPT-01: a patient is also blocked at or after the slot's start.
 *
 * Returns the instant the patient check used, so the repository can repeat it
 * inside the write (`startsAfter`); `undefined` for provider callers, who
 * have no start-time cutoff in V1.
 */
export async function assertBookingChangeAllowed(
  tx: Prisma.TransactionClient,
  slots: AppointmentSlotRepository,
  appointment: Pick<Appointment, 'id' | 'slot_id' | 'visit_status'>,
  scope: AppointmentScope,
  now: Date = new Date(),
): Promise<Date | undefined> {
  if (!canChangeBooking(appointment.visit_status)) {
    const started = appointment.visit_status === 'IN_DOCTOR_ROOM' || appointment.visit_status === 'LEFT';
    throw new BusinessRuleError(
      started ? 'APPOINTMENT_VISIT_IN_PROGRESS' : 'APPOINTMENT_VISIT_ENDED',
      started
        ? 'لا يمكن إلغاء الموعد أو تغييره بعد دخول المريض إلى غرفة الطبيب.'
        : 'انتهت زيارة هذا الموعد، فلا يمكن إلغاؤه أو تغييره.',
      { visitStatus: appointment.visit_status },
    );
  }

  if (scope.kind !== 'PATIENT') {
    return undefined;
  }

  const slot = await slots.findById(tx, appointment.slot_id);
  if (!slot || !isBeforeAppointmentStart(slot.start_at, now)) {
    throw new BusinessRuleError(
      'APPOINTMENT_CHANGE_WINDOW_CLOSED',
      'لا يمكن إلغاء الموعد أو تغييره بعد بدء موعده.',
      { appointmentId: appointment.id },
    );
  }
  return now;
}
