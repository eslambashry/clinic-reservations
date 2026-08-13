import { Injectable } from '@nestjs/common';
import { Pharmacy } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CreatePharmacyInput, PharmacyRepository } from '../infrastructure/pharmacy.repository';

@Injectable()
export class CreatePharmacyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacies: PharmacyRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(input: CreatePharmacyInput, actor: AccessTokenPayload): Promise<Pharmacy> {
    return this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.pharmacies.create(tx, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy.create',
        resourceType: 'pharmacy',
        resourceId: pharmacy.id,
      });

      return pharmacy;
    });
  }
}
