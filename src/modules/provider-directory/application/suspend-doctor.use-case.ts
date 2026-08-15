import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

@Injectable()
export class SuspendDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(doctorId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) {
        throw new NotFoundError('Doctor', doctorId);
      }

      await this.doctors.setStatus(tx, doctorId, doctor.version, 'SUSPENDED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.suspend',
        resourceType: 'doctor',
        resourceId: doctorId,
        reasonCode: `previous_status:${doctor.status}`,
      });
    });
  }
}
