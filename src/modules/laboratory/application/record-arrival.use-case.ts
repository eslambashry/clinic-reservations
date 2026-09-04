import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertStatus, hasCustodyEventAfter } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface RecordArrivalInput {
  note?: string;
}

export interface RecordArrivalResult {
  labOrderId: string;
  status: 'AWAITING_SAMPLE';
}

/**
 * `POST /lab-orders/{orderId}/arrival`, `LAB_STAFF` only — the arrival
 * signal the Discovery Document never defined (Readiness Plan §E step 3).
 * `VISIT`-only; home-collection orders dispatch a courier instead
 * (`DispatchCourierUseCase`). Custody-only: no `LabOrder.status` change.
 */
@Injectable()
export class RecordArrivalUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RecordArrivalInput | undefined, actor: AccessTokenPayload): Promise<RecordArrivalResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'AWAITING_SAMPLE', 'LAB_ORDER_NOT_AWAITING_SAMPLE', 'تسجيل الوصول يتطلّب حجزًا مؤكّدًا في انتظار العيّنة.');
      if (order.collection_type !== 'VISIT') {
        throw new BusinessRuleError('LAB_ORDER_NOT_VISIT', 'هذا طلب سحب منزلي؛ أرسل مندوبًا بدلاً من تسجيل الوصول.');
      }

      const events = (await this.getCustodyEvents.executeForOrders(tx, [labOrderId])).get(labOrderId) ?? [];
      if (hasCustodyEventAfter(events, ['ARRIVAL_CONFIRMED'])) {
        throw new ConflictError('LAB_ORDER_ARRIVAL_ALREADY_RECORDED', 'تم تسجيل وصول المريض لهذا الطلب بالفعل.');
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('ARRIVAL_CONFIRMED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input?.note?.trim() || undefined,
      });

      return { labOrderId, status: order.status as 'AWAITING_SAMPLE' };
    });
  }
}
