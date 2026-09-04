import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertHasLiveSample, assertStatus, hasLiveSample } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { GetCustodyEventsUseCase } from './get-custody-events.use-case';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface StartAnalysisInput {
  note?: string;
  /**
   * From the local technician roster the dashboard keeps client-side — not a
   * real `User`/actor account. Folded into the audit detail text rather than
   * overriding `actorName` (which always reflects the real authenticated
   * caller, for real accountability): a free-text label should never be
   * able to stand in for who actually performed an audited action.
   */
  technicianName?: string;
}

export interface StartAnalysisResult {
  labOrderId: string;
  status: 'IN_ANALYSIS';
}

/** `POST /lab-orders/{orderId}/start-analysis`, `LAB_STAFF` only — `AWAITING_SAMPLE --> IN_ANALYSIS`, requires a live sample. */
@Injectable()
export class StartAnalysisUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetCustodyEventsUseCase) private readonly getCustodyEvents: GetCustodyEventsUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: StartAnalysisInput | undefined, actor: AccessTokenPayload): Promise<StartAnalysisResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'AWAITING_SAMPLE', 'LAB_ORDER_NOT_AWAITING_SAMPLE', 'بدء التحليل يتطلّب سحب العيّنة أولاً.');

      const events = (await this.getCustodyEvents.executeForOrders(tx, [labOrderId])).get(labOrderId) ?? [];
      assertHasLiveSample(hasLiveSample(events));

      await this.labOrders.setStatus(tx, labOrderId, order.version, 'IN_ANALYSIS');

      const detailParts = [input?.technicianName?.trim(), input?.note?.trim()].filter(Boolean);
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('ANALYSIS_STARTED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: detailParts.length > 0 ? detailParts.join(' — ') : undefined,
      });

      return { labOrderId, status: 'IN_ANALYSIS' as const };
    });
  }
}
