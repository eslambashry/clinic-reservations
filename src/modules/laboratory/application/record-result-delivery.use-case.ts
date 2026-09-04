import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertNoPendingReview, assertStatus } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';
import { LabResultRepository } from '../infrastructure/lab-result.repository';

export type ResultRecipientRole = 'patient' | 'doctor' | 'other';
export type DeliveryMethod = 'whatsapp' | 'email' | 'in_person' | 'other';

export interface RecordResultDeliveryInput {
  recipientRole: ResultRecipientRole;
  recipientName: string;
  method: DeliveryMethod;
  note?: string;
}

export interface RecordResultDeliveryResult {
  labOrderId: string;
  status: string;
}

const ROLE_LABEL: Record<ResultRecipientRole, string> = { patient: 'المريض', doctor: 'الطبيب الطالب', other: 'أخرى' };
const METHOD_LABEL: Record<DeliveryMethod, string> = { whatsapp: 'واتساب', email: 'بريد إلكتروني', in_person: 'تسليم مباشر', other: 'أخرى' };

/**
 * `POST /lab-orders/{orderId}/record-delivery`, `LAB_STAFF` only. Per
 * DEC-004, no delivery channel exists — this records that **staff attest**
 * they handed the report off, never that the system sent anything. Requires
 * `RESULTS_READY` and every result already reviewed (`assertNoPendingReview`)
 * — cannot attest delivery of results nobody has made the critical call on.
 */
@Injectable()
export class RecordResultDeliveryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabResultRepository) private readonly labResults: LabResultRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: RecordResultDeliveryInput, actor: AccessTokenPayload): Promise<RecordResultDeliveryResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }
    const name = input.recipientName.trim();
    if (!name) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'اسم المستلِم مطلوب.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== membership.contextId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'RESULTS_READY', 'LAB_ORDER_RESULTS_NOT_READY', 'النتائج غير جاهزة للتسليم بعد.');

      const results = await this.labResults.findByOrderId(tx, labOrderId);
      assertNoPendingReview(results.some((r) => r.review_state === 'UNREVIEWED'));

      const summary = `${ROLE_LABEL[input.recipientRole]} · ${name} · ${METHOD_LABEL[input.method]}`;
      const extra = input.note?.trim();
      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('RESULT_DELIVERED'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: extra ? `${summary} — ${extra}` : summary,
      });

      return { labOrderId, status: order.status };
    });
  }
}
