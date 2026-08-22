import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository, UpdateClinicInput } from '../infrastructure/clinic.repository';

@Injectable()
export class UpdateClinicUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(clinicId: string, input: UpdateClinicInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const clinic = await this.clinics.findById(tx, clinicId);
      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }

      await this.clinics.update(tx, clinicId, clinic.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic.update',
        resourceType: 'clinic',
        resourceId: clinicId,
      });
    });
  }
}
