import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

@Injectable()
export class VerifyPharmacyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacies: PharmacyRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(pharmacyId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.pharmacies.findById(tx, pharmacyId);
      if (!pharmacy) {
        throw new NotFoundError('Pharmacy', pharmacyId);
      }

      await this.pharmacies.setStatus(tx, pharmacyId, pharmacy.version, 'VERIFIED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy.verify',
        resourceType: 'pharmacy',
        resourceId: pharmacyId,
        reasonCode: `previous_status:${pharmacy.status}`,
      });

      await this.outbox.emit(tx, 'ProviderVerified', { providerType: 'PHARMACY', providerId: pharmacyId });
    });
  }
}
