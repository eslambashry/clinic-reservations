import { DateTime } from 'luxon';

/**
 * Live clinic-flow state for a confirmed appointment. This is deliberately
 * separate from `AppointmentStatus`: arrival/progress through the clinic is
 * not cancellation, rescheduling, payment, or clinical completion.
 */
export type VisitStatusValue = 'WAITING' | 'IN_DOCTOR_ROOM' | 'LEFT' | 'CANCELLED' | 'TIME_EXPIRED';

const NEXT_VISIT_STATUS: Record<VisitStatusValue, VisitStatusValue | null> = {
  WAITING: 'IN_DOCTOR_ROOM',
  IN_DOCTOR_ROOM: 'LEFT',
  LEFT: null,
  CANCELLED: null,
  TIME_EXPIRED: null,
};

export function nextVisitStatus(status: VisitStatusValue): VisitStatusValue | null {
  return NEXT_VISIT_STATUS[status];
}

export function isValidVisitStatusTransition(current: VisitStatusValue, target: VisitStatusValue): boolean {
  return nextVisitStatus(current) === target;
}

/**
 * PM-APPT-02: once the patient has entered the doctor's room the visit is
 * under way, so the booking itself is frozen for every actor: cancelling or
 * rescheduling is only allowed while the patient is still `WAITING`.
 */
export function canChangeBooking(visitStatus: VisitStatusValue): boolean {
  return visitStatus === 'WAITING';
}

/**
 * PM-APPT-01: a patient may cancel or reschedule only strictly before the
 * appointment's start instant. `start_at` is an absolute UTC instant, so no
 * timezone is involved in the comparison.
 */
export function isBeforeAppointmentStart(startAt: Date, now: Date): boolean {
  return now.getTime() < startAt.getTime();
}

/** Whether `now` falls on the appointment's calendar day in the branch's IANA zone. */
export function isOnAppointmentLocalDay(startAt: Date, now: Date, ianaTimezone: string): boolean {
  const appointmentDay = DateTime.fromJSDate(startAt, { zone: ianaTimezone });
  const today = DateTime.fromJSDate(now, { zone: ianaTimezone });
  // An invalid zone yields invalid DateTimes; fail closed rather than guess.
  if (!appointmentDay.isValid || !today.isValid) return false;
  return appointmentDay.toISODate() === today.toISODate();
}

/**
 * PM-APPT-03 ("B+"): starting the visit (`WAITING -> IN_DOCTOR_ROOM`) is only
 * allowed on the appointment's local calendar day, so a future-day or old
 * past-day appointment is not changed by accident. Once the visit has begun,
 * finishing it (`IN_DOCTOR_ROOM -> LEFT`) is always allowed, including after
 * midnight — an active consultation must be able to reach its terminal state.
 */
export function isVisitTransitionAllowedAt(
  target: VisitStatusValue,
  startAt: Date,
  now: Date,
  ianaTimezone: string,
): boolean {
  if (target === 'LEFT') return true;
  return isOnAppointmentLocalDay(startAt, now, ianaTimezone);
}
