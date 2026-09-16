import { Inject, Injectable } from '@nestjs/common';
import { Laboratory } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CreateLaboratoryInput, LaboratoryRepository } from '../infrastructure/laboratory.repository';

@Injectable()
export class CreateLaboratoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateLaboratoryInput, actor: AccessTokenPayload): Promise<Laboratory> {
    return this.prisma.$transaction(async (tx) => {
      const laboratory = await this.laboratories.create(tx, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.laboratory.create',
        resourceType: 'laboratory',
        resourceId: laboratory.id,
      });

      return laboratory;
    });
  }
}
