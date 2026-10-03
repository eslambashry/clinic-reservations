import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

/**
 * File 12 Part 51 — provider clinical requests' patient-relationship gate.
 * There is no dedicated doctor↔patient link table in this codebase (the
 * deferred `encounter-emr` module would have been the natural home for one);
 * `Appointment` is the only existing record of a patient having actually
 * been under a given doctor's care, so "patient has ≥1 appointment under one
 * of the caller's own affiliations" is the relationship, defined once here
 * rather than re-derived per endpoint (same reasoning as
 * `ResolveAppointmentScopeUseCase`).
 *
 * Throws `NotFoundError` rather than `ForbiddenError` on a non-relationship
 * — same existence-hiding convention `ResolveDoctorScopeUseCase`/
 * `CreateClinicStaffAppointmentUseCase` already use for cross-tenant ids: a
 * doctor/assistant probing an arbitrary patient id must not be able to tell
 * "exists, not yours" from "doesn't exist" apart.
 */
@Injectable()
export class AssertPatientInDoctorScopeUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(patientId: string, affiliationIds: string[]): Promise<void> {
    const hasRelationship = await this.appointments.existsForPatientAndAffiliations(this.prisma, patientId, affiliationIds);
    if (!hasRelationship) {
      throw new NotFoundError('Patient', patientId);
    }
  }
}
