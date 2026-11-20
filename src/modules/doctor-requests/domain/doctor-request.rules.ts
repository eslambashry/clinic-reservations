import { DoctorRequestStatus } from '@prisma/client';

export const DOCTOR_REQUEST_DETAIL_FIELDS = ['doctorName', 'clinicName', 'location', 'specialty', 'contactPhone', 'notes'] as const;

/** A request must carry at least one non-blank detail, otherwise Admin has nothing to act on. */
export function hasAnyDetail(details: Partial<Record<(typeof DOCTOR_REQUEST_DETAIL_FIELDS)[number], string | null | undefined>>): boolean {
  return DOCTOR_REQUEST_DETAIL_FIELDS.some((field) => (details[field] ?? '').trim() !== '');
}

/** DOCTOR_ADDED and REJECTED are final; PENDING / IN_REVIEW may move to any other status. */
export function canTransition(from: DoctorRequestStatus, to: DoctorRequestStatus): boolean {
  if (from === to) {
    return false;
  }
  return from === 'PENDING' || from === 'IN_REVIEW';
}

export const MAX_OPEN_DOCTOR_REQUESTS_PER_PATIENT = 5;

export function hasReachedOpenRequestLimit(openCount: number): boolean {
  return openCount >= MAX_OPEN_DOCTOR_REQUESTS_PER_PATIENT;
}
