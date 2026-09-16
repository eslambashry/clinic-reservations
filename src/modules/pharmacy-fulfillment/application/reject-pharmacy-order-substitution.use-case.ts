import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { SubstitutionRepository } from '../infrastructure/substitution.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface RejectPharmacyOrderSubstitutionResult {
  pharmacyOrderId: string;
  status: 'REJECTED';
}

/**
 * File 11 Part 14 (`SUBSTITUTION_PROPOSED --> REJECTED: patient rejects`).
 * This legacy-compatible path remains for already-persisted
 * `SUBSTITUTION_PROPOSED` orders. The current flat-quote staff console does
 * not create substitutions, and the current pharmacy flow has no patient
 * approval or payment transition.
 */
@Injectable()
export class RejectPharmacyOrderSubstitutionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(SubstitutionRepository) private readonly substitutions: SubstitutionRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<RejectPharmacyOrderSubstitutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.patient_id !== actor.sub) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      if (order.status !== 'SUBSTITUTION_PROPOSED') {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_SUBSTITUTION_PROPOSED', 'لا يوجد بديل مقترح في هذا الطلب لرفضه.');
      }

      await this.substitutions.rejectAllPendingForOrder(tx, pharmacyOrderId);
      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, 'REJECTED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order-substitution.reject',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, status: 'REJECTED' as const };
    });
  }
}
