import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

export interface AppointmentForReview {
  appointmentId: string;
  patientId: string;
  status: AppointmentStatus;
  doctorId: string;
}

/**
 * Application-layer seam for `reviews`: just enough of an appointment to decide
 * review eligibility. Owner-scoped — someone else's appointment is a 404, same
 * as `GetAppointmentUseCase`, so ids can't be probed.
 */
@Injectable()
export class GetAppointmentForReviewUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(appointmentId: string, patientId: string, db: Prisma.TransactionClient = this.prisma): Promise<AppointmentForReview> {
    const appointment = await this.appointments.findByIdWithSlotTimes(db, appointmentId);
    if (!appointment || appointment.patient_id !== patientId) {
      throw new NotFoundError('Appointment', appointmentId);
    }
    return {
      appointmentId: appointment.id,
      patientId: appointment.patient_id,
      status: appointment.status,
      doctorId: appointment.affiliation.doctor.id,
    };
  }
}
