import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';

/** Idempotent for the same reason as `VerifyLaboratoryUseCase` — re-suspending is a no-op write, never a 409. */
@Injectable()
export class SuspendLaboratoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(laboratoryId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const laboratory = await this.laboratories.findById(tx, laboratoryId);
      if (!laboratory || laboratory.deleted_at) {
        throw new NotFoundError('Laboratory', laboratoryId);
      }

      await this.laboratories.setStatus(tx, laboratoryId, laboratory.version, 'SUSPENDED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.laboratory.suspend',
        resourceType: 'laboratory',
        resourceId: laboratoryId,
        reasonCode: `previous_status:${laboratory.status}`,
      });
    });
  }
}
