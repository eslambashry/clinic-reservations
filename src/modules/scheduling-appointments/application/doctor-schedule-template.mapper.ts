import { ScheduleTemplate } from '@prisma/client';
import { DoctorAffiliationScope } from '../../provider-directory/application/resolve-doctor-scope.use-case';

/**
 * The doctor-facing schedule-template response (File 12 Part 49.5).
 *
 * `camelCase` at the API layer per File 12 Part 09 — the Admin routes
 * (`/v1/schedule-templates`) still return the raw snake_case Prisma model
 * and are deliberately left alone: changing them would be a breaking change
 * to an existing public contract for no benefit to this work.
 *
 * `version` is echoed so the dashboard can round-trip it back on `PATCH`
 * and get a real `409 OPTIMISTIC_LOCK_CONFLICT` instead of silently
 * clobbering a concurrent edit.
 */
export interface MyScheduleTemplate {
  id: string;
  doctorClinicAffiliationId: string;
  clinicBranchId: string;
  clinicId: string;
  clinicName: string;
  /** The branch timezone the `HH:mm` window below is expressed in (Part 33.6). */
  ianaTimezone: string;
  /** ISO-8601 weekday, 1=Monday…7=Sunday (Part 33.5). */
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toMyScheduleTemplate(template: ScheduleTemplate, affiliation: DoctorAffiliationScope): MyScheduleTemplate {
  return {
    id: template.id,
    doctorClinicAffiliationId: template.doctor_clinic_affiliation_id,
    clinicBranchId: affiliation.clinicBranchId,
    clinicId: affiliation.clinicId,
    clinicName: affiliation.clinicName,
    ianaTimezone: affiliation.ianaTimezone,
    weekday: template.weekday,
    startTime: template.start_time,
    endTime: template.end_time,
    slotDurationMinutes: template.slot_duration_minutes,
    bufferMinutes: template.buffer_minutes,
    version: template.version,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}
