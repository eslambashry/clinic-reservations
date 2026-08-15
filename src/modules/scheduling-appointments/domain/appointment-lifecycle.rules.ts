import { APPOINTMENT_CONSTANTS } from '../../../shared/config/constants';

/**
 * File 11 Part 12 / File 12 Part 35: framework-free appointment-lifecycle
 * math (File 12 Part 05 — no Prisma/HTTP imports here).
 */

/** A hold's TTL window, computed from the moment it's created. */
export function holdExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + APPOINTMENT_CONSTANTS.HOLD_TTL_MINUTES * 60 * 1000);
}
