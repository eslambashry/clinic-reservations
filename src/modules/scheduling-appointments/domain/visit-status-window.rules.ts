/**
 * Operational guard for live visit changes. Appointment timestamps are UTC
 * instants, so comparing their epoch values is timezone-safe and always
 * follows the slot attached to the current appointment row after a reschedule.
 *
 * The 30-minute arrival period is deliberately a named scheduling policy,
 * rather than presentation-layer date logic. See File 12 Part 49.
 */
export const VISIT_STATUS_EARLY_ARRIVAL_WINDOW_MS = 30 * 60 * 1000;

export type VisitStatusWindowResult = 'ELIGIBLE' | 'TOO_EARLY' | 'OUTSIDE_WINDOW';

export function visitStatusWindowResult(
  startAt: Date,
  endAt: Date,
  now: Date,
): VisitStatusWindowResult {
  if (now.getTime() < startAt.getTime() - VISIT_STATUS_EARLY_ARRIVAL_WINDOW_MS) {
    return 'TOO_EARLY';
  }

  if (now.getTime() > endAt.getTime()) {
    return 'OUTSIDE_WINDOW';
  }

  return 'ELIGIBLE';
}
