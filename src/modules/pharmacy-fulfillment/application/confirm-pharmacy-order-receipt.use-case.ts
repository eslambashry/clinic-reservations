import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { assertOrderIsOutForDelivery } from '../domain/pharmacy-order.rules';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface ConfirmPharmacyOrderReceiptResult {
  pharmacyOrderId: string;
  status: 'FULFILLED';
}

/**
 * 2026-09-04 addition — `POST /pharmacy-orders/{orderId}/confirm-receipt`,
 * `PATIENT` only. `OUT_FOR_DELIVERY --> FULFILLED`, the same terminal hop
 * `CompletePharmacyOrderUseCase` performs for pharmacy staff, but triggered
 * by the owning patient instead: no courier/tracking module exists yet
 * (Phase 9, Delivery), so nothing tells the pharmacy branch when a home
 * delivery actually arrives — staff-side `complete` on an `OUT_FOR_DELIVERY`
 * order (File 12 Part 40 item 5) can only ever be a guess. The patient is the
 * only party who genuinely knows the order was received. Ownership is
 * checked the same way `RejectPharmacyOrderSubstitutionUseCase` does — a
 * 404, not a 403, for anyone
 * who isn't the order's own patient (hides existence).
 */
@Injectable()
export class ConfirmPharmacyOrderReceiptUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(pharmacyOrderId: string, actor: AccessTokenPayload): Promise<ConfirmPharmacyOrderReceiptResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.patient_id !== actor.sub) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      assertOrderIsOutForDelivery(order.status);

      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, 'FULFILLED');

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.confirm-receipt',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      // The patient initiated this transition and already sees the result.
      // Notify the provider who originated the order, if any, without a
      // duplicate push to the patient. This uses the same status template as
      // the pharmacy staff's `complete` transition.
      if (order.created_by_user_id && order.created_by_user_id !== actor.sub) {
        await this.outbox.emit(tx, 'ProviderPharmacyOrderStatusChanged', {
          pharmacyOrderId,
          status: 'FULFILLED',
          fulfillmentType: order.fulfillment_type,
          recipientUserId: order.created_by_user_id,
        });
      }

      return { pharmacyOrderId, status: 'FULFILLED' as const };
    });
  }
}
