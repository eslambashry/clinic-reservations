import { AppointmentStatus, PaymentMethod, VisitStatus } from '@prisma/client';
import { computeRemainingBalance } from '../../payments/domain/payment-money.rules';
import { AppointmentWithDoctorView } from '../infrastructure/appointment.repository';

/**
 * What the patient paid before the visit and what is left to collect at the
 * clinic. Money values are decimal strings (`"450.00"`), like every other
 * amount on this API.
 *
 * - `PAY_AT_CLINIC` (patient app or clinic-staff walk-in): nothing paid yet,
 *   the whole fee is due at the clinic.
 * - `INTERNAL_WALLET` / `CARD` / `FAWRY` / `MOBILE_WALLET`: `paidAmount` was
 *   captured online, possibly a partial amount (policy
 *   `MIN_APPOINTMENT_PAYMENT`); `remainingBalance` is the rest of the fee.
 */
export interface DoctorAppointmentPayment {
  method: PaymentMethod;
  currency: string;
  fullAmount: string;
  paidAmount: string;
  remainingBalance: string;
}

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
  visitStatus: VisitStatus;
  version: number;
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
  /** `null` only when the appointment has no payment intent on record. */
  payment: DoctorAppointmentPayment | null;
  createdAt: Date;
}

function fullName(user: { first_name: string | null; last_name: string | null }): string {
  return [user.first_name, user.last_name].filter((part): part is string => !!part).join(' ');
}

interface AppointmentPaymentSource {
  payment_intent: { method: PaymentMethod; amount: { toFixed(digits: number): string }; full_amount: { toFixed(digits: number): string } | null; currency: string } | null;
  remaining_balance: { toFixed(digits: number): string } | null;
}

/** Shared by both the doctor view and the patient-facing `AppointmentSummary` — same payment shape, same intent row, just exposed on two different response DTOs. */
export function toAppointmentPayment(appointment: AppointmentPaymentSource): DoctorAppointmentPayment | null {
  const intent = appointment.payment_intent;
  if (!intent) return null;

  if (intent.method === 'PAY_AT_CLINIC') {
    const fullAmount = intent.amount.toFixed(2);
    return { method: intent.method, currency: intent.currency, fullAmount, paidAmount: '0.00', remainingBalance: fullAmount };
  }

  const paidAmount = intent.amount.toFixed(2);
  // `full_amount` is null on intents created before partial payments existed,
  // where `amount` was always the whole fee.
  const fullAmount = (intent.full_amount ?? intent.amount).toFixed(2);
  return {
    method: intent.method,
    currency: intent.currency,
    fullAmount,
    paidAmount,
    remainingBalance: appointment.remaining_balance?.toFixed(2) ?? computeRemainingBalance(fullAmount, paidAmount),
  };
}

export function toDoctorAppointmentSummary(appointment: AppointmentWithDoctorView): DoctorAppointmentSummary {
  const branch = appointment.affiliation.clinic_branch;
  return {
    appointmentId: appointment.id,
    status: appointment.status,
    visitStatus: appointment.visit_status,
    version: appointment.version,
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
    payment: toAppointmentPayment(appointment),
    createdAt: appointment.created_at,
  };
}
