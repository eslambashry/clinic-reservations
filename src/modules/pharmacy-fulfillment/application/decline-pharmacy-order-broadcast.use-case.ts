import { Inject, Injectable } from '@nestjs/common';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';

export interface DeclinePharmacyOrderBroadcastResult {
  pharmacyOrderId: string;
  response: 'DECLINED';
}

/**
 * File 12 Part 39: the mirror of accept, without any order-side write —
 * declining never contends for the order itself, only marks this branch's
 * own broadcast row. No outbox event: `PharmacyOrderAccepted` is the only
 * pharmacy event File 11 line 82 names, a decline has no listed consumer.
 */
@Injectable()
export class DeclinePharmacyOrderBroadcastUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<DeclinePharmacyOrderBroadcastResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع صيدلية نشِط.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const broadcast = await this.broadcasts.findByOrderAndBranch(tx, pharmacyOrderId, branchId);
      if (!broadcast) {
        throw new NotFoundError('PharmacyOrderBroadcast', pharmacyOrderId);
      }

      const responded = await this.broadcasts.markResponded(tx, broadcast.id, 'DECLINED');
      if (!responded) {
        throw new ConflictError('BROADCAST_ALREADY_RESPONDED', 'سبق لهذا الفرع الرد على هذا الطلب.');
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order-broadcast.decline',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, response: 'DECLINED' as const };
    });
  }
}
