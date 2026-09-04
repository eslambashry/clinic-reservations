import { AppointmentStatus } from '@prisma/client';
import { AppointmentWithDoctorView } from '../infrastructure/appointment.repository';

/**
 * The Doctor Dashboard's appointment shape (File 12 Part 49.7).
 *
 * Distinct from the patient-facing `AppointmentSummary`: it carries the
 * patient's identity (which the doctor needs and the patient view must not
 * expose) and the branch timezone (the day view is rendered clinic-local),
 * and it drops the doctor's own name, which is redundant to the caller.
 *
 * The lifecycle a doctor sees is the `AppointmentStatus` enum already in the
 * schema — `CONFIRMED`, `CANCELLED`, `RESCHEDULED`, `COMPLETED` are the four
 * states this surface acts on; `HELD`/`EXPIRED` are pre-confirmation
 * booking-funnel states a doctor never sees, since an appointment row is
 * only created at confirm time (Part 35.1).
 */
export interface DoctorAppointmentSummary {
  appointmentId: string;
  status: AppointmentStatus;
  slotId: string;
  startAt: Date;
  endAt: Date;
  doctorClinicAffiliationId: string;
  clinicId: string;
  clinicName: string;
  clinicBranchId: string;
  clinicBranchPhone: string;
  clinicAddressLine1: string;
  clinicCity: string;
  /** IANA zone of the owning branch — `startAt`/`endAt` stay UTC ISO-8601 (File 11 Part 04). */
  ianaTimezone: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  cancelledReason: string | null;
  cancelledBy: string | null;
  rescheduledFromAppointmentId: string | null;
  createdAt: Date;
}

function fullName(user: { first_name: string | null; last_name: string | null }): string {
  return [user.first_name, user.last_name].filter((part): part is string => !!part).join(' ');
}

export function toDoctorAppointmentSummary(appointment: AppointmentWithDoctorView): DoctorAppointmentSummary {
  const branch = appointment.affiliation.clinic_branch;
  return {
    appointmentId: appointment.id,
    status: appointment.status,
    slotId: appointment.slot_id,
    startAt: appointment.slot.start_at,
    endAt: appointment.slot.end_at,
    doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
    clinicId: branch.clinic.id,
    clinicName: branch.clinic.brand_name,
    clinicBranchId: branch.id,
    clinicBranchPhone: branch.phone,
    clinicAddressLine1: branch.address.line1,
    clinicCity: branch.address.city,
    ianaTimezone: branch.iana_timezone,
    patientId: appointment.patient.id,
    patientName: fullName(appointment.patient),
    patientPhone: appointment.patient.phone,
    cancelledReason: appointment.cancelled_reason,
    cancelledBy: appointment.cancelled_by,
    rescheduledFromAppointmentId: appointment.rescheduled_from_appointment_id,
    createdAt: appointment.created_at,
  };
}
