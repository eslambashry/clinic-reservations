import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

/** Rejecting an application is distinct from suspending an operating doctor. */
@Injectable()
export class RejectDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(doctorId: string, reasonCode: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) throw new NotFoundError('Doctor', doctorId);
      if (doctor.status !== 'PENDING') {
        throw new BusinessRuleError('DOCTOR_APPLICATION_NOT_PENDING', 'لا يمكن رفض طلب طبيب لم يعد قيد المراجعة.', { status: doctor.status });
      }
      await this.doctors.setStatus(tx, doctorId, doctor.version, 'REJECTED');
      await this.audit.record(tx, {
        actorUserId: actor.sub, actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.reject', resourceType: 'doctor', resourceId: doctorId, reasonCode,
      });
      await this.outbox.emit(tx, 'ProviderApplicationRejected', { providerType: 'DOCTOR', providerId: doctorId, reasonCode });
    });
  }
}
