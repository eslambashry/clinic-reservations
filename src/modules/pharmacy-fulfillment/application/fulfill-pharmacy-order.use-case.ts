import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertOrderIsPaid, nextStatusAfterFulfill } from '../domain/pharmacy-order.rules';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface FulfillPharmacyOrderResult {
  pharmacyOrderId: string;
  status: 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY';
}

/**
 * 2026-08-29 addition — `POST /pharmacy-orders/{orderId}/fulfill`,
 * `PHARMACY_STAFF` only. `PAID --> READY_FOR_PICKUP` (pickup) or
 * `PAID --> OUT_FOR_DELIVERY` (delivery), per File 11 Part 14's diagram.
 * Neither branch was reachable before this pass (Part 39.6: `OUT_FOR_DELIVERY`
 * was left unreachable pending Delivery, Phase 9 — this only changes the
 * *status flag*, not real courier assignment/tracking, which still doesn't
 * exist). No payment/pricing involved — this is a pure lifecycle transition.
 */
@Injectable()
export class FulfillPharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<FulfillPharmacyOrderResult> {
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
      assertOrderIsPaid(order.status);

      const nextStatus = nextStatusAfterFulfill(order.fulfillment_type);
      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, nextStatus);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.fulfill',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, status: nextStatus as 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' };
    });
  }
}
