import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository, AppointmentWithSlotTimes } from '../infrastructure/appointment.repository';

export interface AppointmentSummary {
  appointmentId: string;
  status: AppointmentStatus;
  slotId: string;
  startAt: Date;
  endAt: Date;
  doctorClinicAffiliationId: string;
  cancelledReason: string | null;
  rescheduledFromAppointmentId: string | null;
  /** Added for display purposes (doctor/clinic name, branch address) — see `WITH_SLOT_TIMES`'s doc comment on why this include exists. */
  doctorId: string;
  doctorName: string;
  clinicBranchId: string;
  clinicName: string;
  clinicAddressLine1: string;
  clinicCity: string;
  clinicPhone: string;
}

function fullName(user: { first_name: string | null; last_name: string | null }): string {
  return [user.first_name, user.last_name].filter((part): part is string => !!part).join(' ');
}

export function toAppointmentSummary(appointment: AppointmentWithSlotTimes): AppointmentSummary {
  const affiliation = appointment.affiliation;
  return {
    appointmentId: appointment.id,
    status: appointment.status,
    slotId: appointment.slot_id,
    startAt: appointment.slot.start_at,
    endAt: appointment.slot.end_at,
    doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
    cancelledReason: appointment.cancelled_reason,
    rescheduledFromAppointmentId: appointment.rescheduled_from_appointment_id,
    doctorId: affiliation.doctor.id,
    doctorName: fullName(affiliation.doctor.user),
    clinicBranchId: affiliation.clinic_branch.id,
    clinicName: affiliation.clinic_branch.clinic.brand_name,
    clinicAddressLine1: affiliation.clinic_branch.address.line1,
    clinicCity: affiliation.clinic_branch.address.city,
    clinicPhone: affiliation.clinic_branch.phone,
  };
}

/**
 * File 10 §2.3 `GET /v1/appointments/{appointmentId}` / File 12 Part 35.14/35.16:
 * patient-only in this increment. "Full detail incl. status history" is the
 * `Appointment` row's own fields (Part 35.16) — no separate timeline exists.
 */
@Injectable()
export class GetAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(appointmentId: string, actor: AccessTokenPayload): Promise<AppointmentSummary> {
    const appointment = await this.appointments.findByIdWithSlotTimes(this.prisma, appointmentId);
    if (!appointment || appointment.patient_id !== actor.sub) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    return toAppointmentSummary(appointment);
  }
}
