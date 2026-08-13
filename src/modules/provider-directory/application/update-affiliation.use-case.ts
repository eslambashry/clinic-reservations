import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AffiliationRepository, UpdateAffiliationInput } from '../infrastructure/affiliation.repository';

/** Pause/reactivate (`status`) and/or fee update — Admin-only (File 12 Part 32.4). */
@Injectable()
export class UpdateAffiliationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliations: AffiliationRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(affiliationId: string, input: UpdateAffiliationInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const affiliation = await this.affiliations.findById(tx, affiliationId);
      if (!affiliation) {
        throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
      }

      await this.affiliations.update(tx, affiliationId, affiliation.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.affiliation.update',
        resourceType: 'doctor_clinic_affiliation',
        resourceId: affiliationId,
      });
    });
  }
}
