import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { hasLiveSample } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';

export interface RejectSampleInput {
  reason: string;
  note?: string;
}

export interface RejectSampleResult {
  labOrderId: string;
  status: string;
}

/**
 * `POST /lab-orders/{orderId}/reject-sample`, `LAB_STAFF` only. Invalidates
 * every result recorded against the current sample (deleted, not archived —
 * mirrors the mock's `row.results = []`), resets every item to `PENDING`,
 * sets `recollection_required`, and reverts `IN_ANALYSIS`/`RESULTS_READY`
 * back to `AWAITING_SAMPLE`. Chain-of-custody rule enforced by
 * `RecordArrivalUseCase`/`DispatchCourierUseCase`'s own guards, not here: a
 * fresh arrival/courier event is required before the next collection.
 */
@Injectable()
export class RejectSampleUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderItemRepository) private readonly labOrderItems: LabOrderItemRepository,
    @Inject(LabResultRepository) private readonly labResults: LabResultRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RejectSampleInput, actor: AccessTokenPayload): Promise<RejectSampleResult> {
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
      if (!hasLiveSample(events)) {
        throw new BusinessRuleError('LAB_ORDER_NO_LIVE_SAMPLE', 'لا توجد عيّنة صالحة لرفضها.');
      }

      await this.labResults.deleteByOrderId(tx, labOrderId);
      await this.labOrderItems.resetToPending(tx, labOrderId);

      const revertToAwaitingSample = order.status === 'IN_ANALYSIS' || order.status === 'RESULTS_READY';
      await this.labOrders.rejectSample(tx, labOrderId, order.version, revertToAwaitingSample);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('SAMPLE_REJECTED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: input.note?.trim() || input.reason,
      });

      return { labOrderId, status: revertToAwaitingSample ? 'AWAITING_SAMPLE' : order.status };
    });
  }
}
