import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertRecollectionRequired, assertStatus } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface RequestRecollectionInput {
  reason: string;
  note?: string;
}

export interface RequestRecollectionResult {
  labOrderId: string;
  status: string;
}

/** `POST /lab-orders/{orderId}/request-recollection`, `LAB_STAFF` only — applies only to a rejected-sample hold (`recollection_required`). Custody-only. */
@Injectable()
export class RequestRecollectionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RequestRecollectionInput, actor: AccessTokenPayload): Promise<RequestRecollectionResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }
    if (!input.reason?.trim()) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'اكتب سبب إعادة سحب العيّنة.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'AWAITING_SAMPLE', 'LAB_ORDER_NOT_AWAITING_SAMPLE', 'إعادة السحب تنطبق على طلب في انتظار عيّنة جديدة.');
      assertRecollectionRequired(order.recollection_required);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('RECOLLECTION_REQUESTED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input.note?.trim() || input.reason,
      });

      return { labOrderId, status: order.status };
    });
  }
}
