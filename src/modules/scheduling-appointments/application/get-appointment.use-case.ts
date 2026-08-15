import { Injectable } from '@nestjs/common';
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
}

export function toAppointmentSummary(appointment: AppointmentWithSlotTimes): AppointmentSummary {
  return {
    appointmentId: appointment.id,
    status: appointment.status,
    slotId: appointment.slot_id,
    startAt: appointment.slot.start_at,
    endAt: appointment.slot.end_at,
    doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
    cancelledReason: appointment.cancelled_reason,
    rescheduledFromAppointmentId: appointment.rescheduled_from_appointment_id,
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
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute(appointmentId: string, actor: AccessTokenPayload): Promise<AppointmentSummary> {
    const appointment = await this.appointments.findByIdWithSlotTimes(this.prisma, appointmentId);
    if (!appointment || appointment.patient_id !== actor.sub) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    return toAppointmentSummary(appointment);
  }
}
