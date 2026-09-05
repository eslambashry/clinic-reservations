import { APPOINTMENT_CONSTANTS } from '../../../shared/config/constants';

/**
 * File 11 Part 12 / File 12 Part 35: framework-free appointment-lifecycle
 * math (File 12 Part 05 — no Prisma/HTTP imports here).
 */

/** A hold's TTL window, computed from the moment it's created. */
export function holdExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + APPOINTMENT_CONSTANTS.HOLD_TTL_MINUTES * 60 * 1000);
}

/**
 * File 12 Part 50.1: the async online-payment methods need longer than the
 * base 5-minute hold to actually complete (Fawry/mobile-wallet approval
 * happens outside our app). `CARD` keeps the existing 5-minute window
 * (business requirement: "the existing appointment hold/default TTL is 5
 * minutes" for card) — no extension needed, so `InitiateOnlineAppointmentPaymentUseCase`
 * only calls this for `FAWRY`/`MOBILE_WALLET`.
 */
export function onlinePaymentHoldExpiresAt(from: Date, method: 'CARD' | 'FAWRY' | 'MOBILE_WALLET'): Date {
  const minutes = method === 'FAWRY' ? 15 : method === 'MOBILE_WALLET' ? 10 : APPOINTMENT_CONSTANTS.HOLD_TTL_MINUTES;
  return new Date(from.getTime() + minutes * 60 * 1000);
}
