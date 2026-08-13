import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository } from '../infrastructure/clinic.repository';

@Injectable()
export class SuspendClinicUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinics: ClinicRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(clinicId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const clinic = await this.clinics.findById(tx, clinicId);
      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }

      await this.clinics.setStatus(tx, clinicId, clinic.version, 'SUSPENDED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic.suspend',
        resourceType: 'clinic',
        resourceId: clinicId,
        reasonCode: `previous_status:${clinic.status}`,
      });
    });
  }
}
