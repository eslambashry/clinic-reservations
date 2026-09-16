/**
 * Live clinic-flow state for a confirmed appointment. This is deliberately
 * separate from `AppointmentStatus`: arrival/progress through the clinic is
 * not cancellation, rescheduling, payment, or clinical completion.
 */
export type VisitStatusValue = 'WAITING' | 'IN_DOCTOR_ROOM' | 'LEFT';

const NEXT_VISIT_STATUS: Record<VisitStatusValue, VisitStatusValue | null> = {
  WAITING: 'IN_DOCTOR_ROOM',
  IN_DOCTOR_ROOM: 'LEFT',
  LEFT: null,
};

export function nextVisitStatus(status: VisitStatusValue): VisitStatusValue | null {
  return NEXT_VISIT_STATUS[status];
}

export function isValidVisitStatusTransition(current: VisitStatusValue, target: VisitStatusValue): boolean {
  return nextVisitStatus(current) === target;
}
