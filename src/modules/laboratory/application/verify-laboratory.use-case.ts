import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';

/**
 * Idempotent by construction, same as `VerifyPharmacyUseCase`: re-verifying
 * an already-VERIFIED laboratory rewrites the same terminal status and
 * re-emits `ProviderVerified` rather than 409ing — the admin console retries
 * this action and a conflict there would be a defect, not a guard.
 */
@Injectable()
export class VerifyLaboratoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(laboratoryId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const laboratory = await this.laboratories.findById(tx, laboratoryId);
      if (!laboratory || laboratory.deleted_at) {
        throw new NotFoundError('Laboratory', laboratoryId);
      }

      await this.laboratories.setStatus(tx, laboratoryId, laboratory.version, 'VERIFIED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.laboratory.verify',
        resourceType: 'laboratory',
        resourceId: laboratoryId,
        reasonCode: `previous_status:${laboratory.status}`,
      });

      await this.outbox.emit(tx, 'ProviderVerified', { providerType: 'LAB', providerId: laboratoryId });
    });
  }
}
