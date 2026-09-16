import { Inject, Injectable } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OptimisticLockError } from '../../../shared/kernel/prisma/optimistic-lock';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { isValidVisitStatusTransition } from '../domain/visit-status.rules';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { DoctorAppointmentSummary, toDoctorAppointmentSummary } from './doctor-appointment.mapper';
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';

export interface UpdateAppointmentVisitStatusInput {
  status: VisitStatus;
  version: number;
}

@Injectable()
export class UpdateAppointmentVisitStatusUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(ResolveAppointmentScopeUseCase) private readonly appointmentScope: ResolveAppointmentScopeUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    appointmentId: string,
    input: UpdateAppointmentVisitStatusInput,
    actor: AccessTokenPayload,
  ): Promise<DoctorAppointmentSummary> {
    const scope = await this.appointmentScope.execute(actor);

    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.appointments.findByIdWithDoctorView(tx, appointmentId);
      if (!appointment || !isAppointmentInScope(appointment, scope)) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      if (appointment.version !== input.version) {
        throw new OptimisticLockError(appointmentId, input.version);
      }

      if (appointment.status !== 'CONFIRMED') {
        throw new BusinessRuleError(
          'APPOINTMENT_VISIT_STATUS_NOT_UPDATABLE',
          'يمكن تحديث حالة الزيارة للمواعيد المؤكدة فقط.',
          { appointmentStatus: appointment.status },
        );
      }

      if (!isValidVisitStatusTransition(appointment.visit_status, input.status)) {
        throw new BusinessRuleError(
          'INVALID_VISIT_STATUS_TRANSITION',
          'يجب تحديث حالة الزيارة بالترتيب: انتظار، ثم داخل غرفة الطبيب، ثم غادر.',
          { currentStatus: appointment.visit_status, requestedStatus: input.status },
        );
      }

      await this.appointments.updateVisitStatus(tx, appointmentId, input.version, input.status);
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.visit_status.update',
        resourceType: 'appointment',
        resourceId: appointment.id,
        subjectPatientId: appointment.patient_id,
        reasonCode: `${appointment.visit_status}_TO_${input.status}`,
      });

      const updated = await this.appointments.findByIdWithDoctorView(tx, appointmentId);
      if (!updated) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      return toDoctorAppointmentSummary(updated);
    });
  }
}
