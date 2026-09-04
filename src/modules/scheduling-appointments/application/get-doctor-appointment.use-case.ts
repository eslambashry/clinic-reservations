import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { DoctorAppointmentSummary, toDoctorAppointmentSummary } from './doctor-appointment.mapper';
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';

/**
 * `GET /v1/doctors/me/appointments/{appointmentId}` (File 12 Part 49.7) —
 * the "or the doctor" half of File 11 05.5's auth line, deferred by Part
 * 35.14 until a doctor-scoped primitive existed.
 *
 * An appointment outside the caller's affiliations is a 404, never a 403 —
 * the same existence-hiding rule the patient detail route already follows,
 * so an id cannot be probed for membership of someone else's clinic.
 */
@Injectable()
export class GetDoctorAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveAppointmentScopeUseCase) private readonly appointmentScope: ResolveAppointmentScopeUseCase,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(appointmentId: string, actor: AccessTokenPayload): Promise<DoctorAppointmentSummary> {
    const scope = await this.appointmentScope.execute(actor);
    const appointment = await this.appointments.findByIdWithDoctorView(this.prisma, appointmentId);

    if (!appointment || !isAppointmentInScope(appointment, scope)) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    return toDoctorAppointmentSummary(appointment);
  }
}
