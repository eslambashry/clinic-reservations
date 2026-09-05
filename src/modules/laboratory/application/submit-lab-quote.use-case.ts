import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertStatus } from '../domain/lab-order.rules';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderItemRepository } from '../infrastructure/lab-order-item.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface SubmitLabQuoteInput {
  totalPrice: string;
  appointmentAt: string;
  prepInstructions: string;
  queueNumber: number;
}

export interface SubmitLabQuoteResult {
  labOrderId: string;
  status: 'QUOTED';
}

const CURRENCY = 'EGP';

/**
 * `POST /lab-orders/{orderId}/quote`, `LAB_STAFF` only. `REQUESTED -->
 * QUOTED`: one flat total, one appointment instant, prep instructions, and
 * the patient's queue slot for that day — mirrors
 * `SubmitPharmacyOrderQuoteUseCase`'s flat-quote shape exactly (no per-test
 * pricing; `unit_price` split across items is presentational only, same
 * "not specified anywhere" reasoning the mock's own comment gives).
 *
 * No item-count gate (File 12 Part 50): a freeform order (patient uploaded
 * an image instead of picking catalog tests) has zero `LabOrderItem` rows by
 * design — the image is what told the lab which analysis to run, staff
 * price the whole request after reading it, the same way this method
 * already prices a catalog-based order as one flat total rather than
 * per-line. The per-item price split below is simply skipped when there are
 * no items to split across.
 */
@Injectable()
export class SubmitLabQuoteUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabOrderItemRepository) private readonly labOrderItems: LabOrderItemRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(labOrderId: string, input: SubmitLabQuoteInput, actor: AccessTokenPayload): Promise<SubmitLabQuoteResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }
    const branchId = membership.contextId;

    if (!(Number(input.totalPrice) > 0)) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'إجمالي عرض السعر يجب أن يكون أكبر من صفر.');
    }
    if (!input.prepInstructions.trim()) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'تعليمات التحضير مطلوبة.');
    }
    if (!Number.isInteger(input.queueNumber) || input.queueNumber <= 0) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'رقم الدور يجب أن يكون رقمًا صحيحًا أكبر من صفر.');
    }
    const appointmentMs = new Date(input.appointmentAt).getTime();
    if (!Number.isFinite(appointmentMs) || appointmentMs <= Date.now()) {
      throw new BusinessRuleError('VALIDATION_ERROR', 'موعد الزيارة يجب أن يكون تاريخًا صحيحًا في المستقبل.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.labOrders.findById(tx, labOrderId);
      if (!order || order.lab_branch_id !== branchId) {
        throw new NotFoundError('LabOrder', labOrderId);
      }
      assertStatus(order.status, 'REQUESTED', 'LAB_ORDER_NOT_REQUESTED', 'الموافقة متاحة فقط لطلب في انتظار عرض سعر.');

      const items = await this.labOrderItems.findByOrderId(tx, labOrderId);

      // Price is quoted for the order as a whole; per-test pricing is not
      // specified anywhere, so the split is presentational only (same
      // reasoning the mock's own `submitQuote` comment gives). A freeform
      // order (File 12 Part 50) has no items to split across at all.
      if (items.length > 0) {
        const perItem = (Number(input.totalPrice) / items.length).toFixed(2);
        await this.labOrderItems.setUnitPrice(tx, labOrderId, perItem);
      }

      await this.labOrders.submitQuote(tx, labOrderId, order.version, {
        totalPrice: input.totalPrice,
        currency: CURRENCY,
        appointmentAt: new Date(input.appointmentAt),
        prepInstructions: input.prepInstructions.trim(),
        queueNumber: input.queueNumber,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('QUOTE_SENT'),
        resourceType: 'lab_order',
        resourceId: labOrderId,
        reasonCode: `#${input.queueNumber}`,
      });

      return { labOrderId, status: 'QUOTED' as const };
    });
  }
}
