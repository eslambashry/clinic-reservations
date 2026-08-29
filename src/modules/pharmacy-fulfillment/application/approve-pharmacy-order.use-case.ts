import { Inject, Injectable } from '@nestjs/common';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { computeOrderTotal } from '../domain/pharmacy-order-quote.rules';
import { SubstitutionRepository } from '../infrastructure/substitution.repository';
import { PharmacyOrderItemRepository } from '../infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface ApprovePharmacyOrderResult {
  pharmacyOrderId: string;
  status: 'PAID';
  paymentIntentId: string;
  totalAmount: string;
  currency: string;
}

const APPROVABLE_STATUSES = ['ACCEPTED', 'SUBSTITUTION_PROPOSED'] as const;

/**
 * File 10 line 205 `POST /v1/pharmacy-orders/{orderId}/approve` / File 10
 * Part 8.1 ("approval and payment-intent-creation are the same moment, not
 * decoupled") / File 11 Part 14 (`SUBSTITUTION_PROPOSED --> ACCEPTED` and
 * `ACCEPTED --> PAID`, both hops in this one call). Reuses
 * `CapturePayAtClinicPaymentUseCase` as-is (Part 39.7) — no pharmacy-
 * specific clone. `providerId` is the pharmacy *branch* id, not the parent
 * `Pharmacy` — the branch is the operationally-distinct unit that actually
 * won the broadcast and quoted the order, mirroring `ClinicBranch`'s role
 * for appointments (Part 39, documented assumption — no existing CLINIC-
 * ledger precedent settles this either way).
 */
@Injectable()
export class ApprovePharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderItemRepository) private readonly pharmacyOrderItems: PharmacyOrderItemRepository,
    @Inject(SubstitutionRepository) private readonly substitutions: SubstitutionRepository,
    @Inject(CapturePayAtClinicPaymentUseCase) private readonly capturePayment: CapturePayAtClinicPaymentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<ApprovePharmacyOrderResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.patient_id !== actor.sub) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      if (!APPROVABLE_STATUSES.includes(order.status as (typeof APPROVABLE_STATUSES)[number])) {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_APPROVABLE', 'This order is not awaiting approval.');
      }
      // order.pharmacy_branch_id is guaranteed non-null here: reaching ACCEPTED/SUBSTITUTION_PROPOSED
      // requires having gone through claimForBranch (File 11 line 456), which always sets it.
      const branchId = order.pharmacy_branch_id!;

      if (order.status === 'SUBSTITUTION_PROPOSED') {
        await this.substitutions.approveAllPendingForOrder(tx, pharmacyOrderId);
      }

      const items = await this.pharmacyOrderItems.findByOrderId(tx, pharmacyOrderId);
      const totalAmount = computeOrderTotal(
        items.map((item) => ({ status: item.status, unitPrice: item.unit_price?.toString() ?? null, quantity: item.quantity })),
      );
      const currency = PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY;

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
