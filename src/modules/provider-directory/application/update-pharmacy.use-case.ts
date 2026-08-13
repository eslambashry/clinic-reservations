import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyRepository, UpdatePharmacyInput } from '../infrastructure/pharmacy.repository';

@Injectable()
export class UpdatePharmacyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacies: PharmacyRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(pharmacyId: string, input: UpdatePharmacyInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.pharmacies.findById(tx, pharmacyId);
      if (!pharmacy) {
        throw new NotFoundError('Pharmacy', pharmacyId);
      }

      await this.pharmacies.update(tx, pharmacyId, pharmacy.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy.update',
        resourceType: 'pharmacy',
        resourceId: pharmacyId,
      });
    });
  }
}
