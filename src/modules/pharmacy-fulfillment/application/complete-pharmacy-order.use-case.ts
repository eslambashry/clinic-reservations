import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertOrderIsReadyToComplete } from '../domain/pharmacy-order.rules';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface CompletePharmacyOrderResult {
  pharmacyOrderId: string;
  status: 'FULFILLED';
}

/**
 * 2026-08-29 addition — `POST /pharmacy-orders/{orderId}/complete`,
 * `PHARMACY_STAFF` only. `READY_FOR_PICKUP --> FULFILLED` or
 * `OUT_FOR_DELIVERY --> FULFILLED` — the terminal close. Deliberately no
 * `DELIVERED` intermediate step: `docs/PROPOSED_CONTRACT.md` §2's own
 * documented fallback is taken here ("let `completeOrder()` accept
 * `OUT_FOR_DELIVERY` directly") rather than adding a schema enum value.
 */
@Injectable()
export class CompletePharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<CompletePharmacyOrderResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active pharmacy branch assignment.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.pharmacy_branch_id !== branchId) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      assertOrderIsReadyToComplete(order.status);

      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, 'FULFILLED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.complete',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, status: 'FULFILLED' as const };
    });
  }
}
