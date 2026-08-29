import { Inject, Injectable } from '@nestjs/common';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface ApprovePharmacyOrderResult {
  pharmacyOrderId: string;
  status: 'PAID';
  paymentIntentId: string;
  totalAmount: string;
  currency: string;
}

const APPROVABLE_STATUS = 'ACCEPTED';

/**
 * File 10 line 205 `POST /v1/pharmacy-orders/{orderId}/approve` / File 10
 * Part 8.1 ("approval and payment-intent-creation are the same moment, not
 * decoupled"). Reuses `CapturePayAtClinicPaymentUseCase` as-is (Part 39.7).
 * `providerId` is the pharmacy *branch* id (Part 39.21).
 *
 * 2026-08-29 rewrite: captures `order.total_price`/`order.currency` directly
 * (set by the flat quote step) instead of summing `PharmacyOrderItem`
 * unit prices. `SUBSTITUTION_PROPOSED` is dropped from the approvable-status
 * set — the flat quote flow can never produce it (see
 * `submit-pharmacy-order-quote.use-case.ts`), so the pending-substitution
 * resolution this use-case used to do first has no trigger left, same
 * "left unproduced" reasoning already used elsewhere in this module (Part
 * 39.23).
 */
@Injectable()
export class ApprovePharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(CapturePayAtClinicPaymentUseCase) private readonly capturePayment: CapturePayAtClinicPaymentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<ApprovePharmacyOrderResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.patient_id !== actor.sub) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      if (order.status !== APPROVABLE_STATUS || !order.total_price || !order.currency) {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_APPROVABLE', 'This order is not awaiting approval.');
      }
      // order.pharmacy_branch_id is guaranteed non-null here: reaching ACCEPTED
      // requires having gone through claimForBranch (File 11 line 456), which always sets it.
      const branchId = order.pharmacy_branch_id!;
      const totalAmount = order.total_price.toString();
      const currency = order.currency;

      const capture = await this.capturePayment.execute(tx, {
        payerUserId: actor.sub,
        payableType: 'PHARMACY_ORDER',
        payableId: pharmacyOrderId,
        amount: totalAmount,
        currency,
        providerType: 'PHARMACY',
        providerId: branchId,
        idempotencyKey: `pharmacy-order:${pharmacyOrderId}`,
      });

      const paid = await this.pharmacyOrders.markPaid(tx, pharmacyOrderId, order.version, capture.paymentIntentId);
      if (!paid) {
        throw new ConflictError('PHARMACY_ORDER_STATUS_CHANGED', 'This order was already approved or modified concurrently.');
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.approve',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, status: 'PAID' as const, paymentIntentId: capture.paymentIntentId, totalAmount, currency };
    });
  }
}
