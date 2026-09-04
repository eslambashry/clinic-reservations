import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertOrderIsRejectable, hasLiveSample } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface RejectLabOrderInput {
  reason: string;
  note?: string;
}

export interface RejectLabOrderResult {
  labOrderId: string;
  status: 'REJECTED';
}

/**
 * `POST /lab-orders/{orderId}/reject`, `LAB_STAFF` only. Blocked once
 * analysis has started, the order is already terminal, or a live sample
 * exists — mirrors the mock's `rejectOrder` exactly (`already past the
 * quoting window`).
 */
@Injectable()
export class RejectLabOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RejectLabOrderInput, actor: AccessTokenPayload): Promise<RejectLabOrderResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }
    if (!input.reason?.trim()) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'اكتب سبب الرفض.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      const events = (await this.getCustodyEvents.executeForOrders(tx, [labOrderId])).get(labOrderId) ?? [];
      assertOrderIsRejectable(order.status, hasLiveSample(events));

      await this.labOrders.rejectOrder(tx, labOrderId, order.version, { reason: input.reason.trim(), note: input.note?.trim() ?? null });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('ORDER_REJECTED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input.note?.trim() || input.reason,
      });

      return { labOrderId, status: 'REJECTED' as const };
    });
  }
}
