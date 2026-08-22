import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository } from '../infrastructure/clinic.repository';

@Injectable()
export class VerifyClinicUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(clinicId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const clinic = await this.clinics.findById(tx, clinicId);
      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }

      await this.clinics.setStatus(tx, clinicId, clinic.version, 'VERIFIED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic.verify',
        resourceType: 'clinic',
        resourceId: clinicId,
        reasonCode: `previous_status:${clinic.status}`,
      });

      await this.outbox.emit(tx, 'ProviderVerified', { providerType: 'CLINIC', providerId: clinicId });
    });
  }
}
