import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertStatus } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface DispatchCourierInput {
  note?: string;
}

export interface DispatchCourierResult {
  labOrderId: string;
  status: 'AWAITING_SAMPLE';
}

/** `POST /lab-orders/{orderId}/dispatch-courier`, `LAB_STAFF` only — `HOME_COLLECTION`-only, File 10 §3.3 capability. Custody-only. */
@Injectable()
export class DispatchCourierUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: DispatchCourierInput | undefined, actor: AccessTokenPayload): Promise<DispatchCourierResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      if (order.collection_type !== 'HOME_COLLECTION') {
        throw new BusinessRuleError('LAB_ORDER_NOT_HOME_COLLECTION', 'هذا طلب زيارة للفرع؛ سجّل وصول المريض بدلاً من إرسال مندوب.');
      }
      assertStatus(order.status, 'AWAITING_SAMPLE', 'LAB_ORDER_NOT_AWAITING_SAMPLE', 'إرسال المندوب يتطلّب حجزًا مؤكّدًا في انتظار العيّنة.');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('IN_TRANSIT'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input?.note?.trim() || undefined,
      });

      return { labOrderId, status: order.status as 'AWAITING_SAMPLE' };
    });
  }
}
