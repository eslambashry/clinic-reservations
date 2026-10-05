import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

export interface PharmacyHandoverAppointment {
  status: AppointmentStatus;
  doctorClinicAffiliationId: string;
  clinicBranchId: string;
  doctorId: string;
}

/** Scheduling-owned lookup for a pharmacy handover linked to a real patient appointment. */
@Injectable()
export class GetPharmacyHandoverAppointmentUseCase {
  constructor(@Inject(AppointmentRepository) private readonly appointments: AppointmentRepository) {}

  async execute(db: Prisma.TransactionClient, appointmentId: string, patientId: string): Promise<PharmacyHandoverAppointment> {
    const appointment = await this.appointments.findByIdWithSlotTimes(db, appointmentId);
    if (!appointment || appointment.patient_id !== patientId) {
      throw new NotFoundError('Appointment', appointmentId);
    }
    return {
      status: appointment.status,
      doctorClinicAffiliationId: appointment.doctor_clinic_affiliation_id,
      clinicBranchId: appointment.affiliation.clinic_branch.id,
      doctorId: appointment.affiliation.doctor.id,
    };
  }
}
