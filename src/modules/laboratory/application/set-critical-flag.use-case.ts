import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';

export interface SetCriticalFlagInput {
  isCritical: boolean;
  note?: string;
}

export interface SetCriticalFlagResult {
  labOrderId: string;
  status: string;
}

/**
 * `POST /lab-orders/{orderId}/results/{resultId}/critical-flag`,
 * `LAB_STAFF` only — the human critical-value call (DEC-003: routes to the
 * reserved safety-notification tier, but that routing itself is not built
 * here, same "no channel exists yet" scope boundary DEC-004 already sets
 * for delivery). One-shot per result: `is_critical`/`review_state` flip
 * together in the same call, so `isCritical && UNREVIEWED` can never occur —
 * the safety invariant `docs/PROPOSED_CONTRACT.md` §2 calls out explicitly.
 * A second call against an already-`REVIEWED` result 409s rather than
 * silently overwriting a prior human decision.
 */
@Injectable()
export class SetCriticalFlagUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabResultRepository) private readonly labResults: LabResultRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, resultId: string, input: SetCriticalFlagInput, actor: AccessTokenPayload): Promise<SetCriticalFlagResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      const result = await this.labResults.findById(tx, resultId);
      if (!result || result.lab_order_id !== labOrderId) {
        throw new NotFoundError('LabResultDocument', resultId);
      }
      if (result.review_state === 'REVIEWED') {
        throw new ConflictError('LAB_RESULT_ALREADY_REVIEWED', 'تم تحديد ما إذا كانت هذه النتيجة حرجة بالفعل.');
      }

      await this.labResults.setCriticalCall(tx, resultId, result.version, input.isCritical);

      if (input.isCritical) {
        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: encodeCustodyAction('CRITICAL_FLAGGED'),
          resourceType: 'lab_order',
          resourceId: labOrderId,
          reasonCode: input.note?.trim() || result.file_label,
        });
      }

      return { labOrderId, status: order.status };
    });
  }
}
