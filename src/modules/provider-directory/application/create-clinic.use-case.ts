import { Inject, Injectable } from '@nestjs/common';
import { Clinic } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ClinicRepository, CreateClinicInput } from '../infrastructure/clinic.repository';

@Injectable()
export class CreateClinicUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateClinicInput, actor: AccessTokenPayload): Promise<Clinic> {
    return this.prisma.$transaction(async (tx) => {
      const clinic = await this.clinics.create(tx, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.clinic.create',
        resourceType: 'clinic',
        resourceId: clinic.id,
      });

      return clinic;
    });
  }
}
