import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface AcceptPharmacyOrderBroadcastResult {
  pharmacyOrderId: string;
  status: 'UNDER_REVIEW';
}

/**
 * File 11 Part 14 (`RECEIVED --> UNDER_REVIEW: pharmacy branch opens it`) /
 * File 11 line 456 / File 12 Part 39: first-accept-wins. No `branchId` is
 * taken from the request — it's resolved from the caller's own
 * `PHARMACY_STAFF` role membership, so a staff member can only ever accept
 * on behalf of their own branch, never one they specify.
 *
 * On a lost race, the broadcast row for THIS branch is deliberately left
 * untouched (not marked `DECLINED`) — File 11 line 456's stated "no
 * additional signal needed, losing pharmacy simply sees the order
 * disappear from their queue."
 */
@Injectable()
export class AcceptPharmacyOrderBroadcastUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<AcceptPharmacyOrderBroadcastResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active pharmacy branch assignment.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const broadcast = await this.broadcasts.findByOrderAndBranch(tx, pharmacyOrderId, branchId);
      if (!broadcast) {
        throw new NotFoundError('PharmacyOrderBroadcast', pharmacyOrderId);
      }
      if (broadcast.response !== null) {
        throw new ConflictError('BROADCAST_ALREADY_RESPONDED', 'This branch has already responded to this order.');
      }

      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }

      const claimed = await this.pharmacyOrders.claimForBranch(tx, pharmacyOrderId, order.version, branchId);
      if (!claimed) {
        throw new ConflictError('ORDER_ALREADY_CLAIMED', 'Another pharmacy branch already claimed this order.');
      }

      const responded = await this.broadcasts.markResponded(tx, broadcast.id, 'ACCEPTED');
      if (!responded) {
        // Defense-in-depth: the `response !== null` check above already covers this in practice.
        throw new ConflictError('BROADCAST_ALREADY_RESPONDED', 'This branch has already responded to this order.');
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order-broadcast.accept',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      await this.outbox.emit(tx, 'PharmacyOrderAccepted', { pharmacyOrderId, pharmacyBranchId: branchId });

      return { pharmacyOrderId, status: 'UNDER_REVIEW' as const };
    });
  }
}
