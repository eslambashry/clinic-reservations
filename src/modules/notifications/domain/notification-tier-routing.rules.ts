import { NotificationTier } from '@prisma/client';

/**
 * File 10 §11 / File 11 Part 19: framework-free tier-routing math (File 12
 * Part 05 — no Prisma/HTTP imports here). Two hard business rules, both
 * enforced here so no per-event handler has to remember them:
 *
 *  1. `SAFETY_CRITICAL` can never be user-disabled — `isUserDisableable`
 *     returning `false` for it is what makes that true regardless of what
 *     a `NotificationPreference` row says.
 *  2. `SAFETY_CRITICAL` bypasses quiet hours — `respectsQuietHours`
 *     returning `false` for it is what makes that true.
 */
export function isUserDisableable(tier: NotificationTier): boolean {
  return tier !== 'SAFETY_CRITICAL';
}

export function respectsQuietHours(tier: NotificationTier): boolean {
  return tier !== 'SAFETY_CRITICAL';
}

export interface QuietHoursWindow {
  /** Local hour (0-23) quiet hours start. */
  startHour: number;
  /** Local hour (0-23) quiet hours end (exclusive). */
  endHour: number;
}

/** Handles the overnight-wrapping case (e.g. 22 -> 8) the same way a plain `startHour < now < endHour` check can't. */
export function isWithinQuietHours(localHour: number, window: QuietHoursWindow): boolean {
  if (window.startHour === window.endHour) {
    return false;
  }
  if (window.startHour < window.endHour) {
    return localHour >= window.startHour && localHour < window.endHour;
  }
  return localHour >= window.startHour || localHour < window.endHour;
}
