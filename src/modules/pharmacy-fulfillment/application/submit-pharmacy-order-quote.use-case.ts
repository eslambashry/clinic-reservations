import { Inject, Injectable } from '@nestjs/common';
import { PharmacyOrderItemStatus } from '@prisma/client';
import { GetDrugCatalogControlledStatusUseCase } from '../../prescriptions/application/get-drug-catalog-controlled-status.use-case';
import { GetPrescriptionItemDrugCodesUseCase } from '../../prescriptions/application/get-prescription-item-drug-codes.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertValidQuoteItemInput, requiresControlledSubstanceConfirmationForQuote, resolveQuoteOutcome } from '../domain/pharmacy-order-quote.rules';
import { NewSubstitution, SubstitutionRepository } from '../infrastructure/substitution.repository';
import { PharmacyOrderItemRepository } from '../infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface SubmitPharmacyOrderQuoteItemInput {
  prescriptionItemId: string;
  status: PharmacyOrderItemStatus;
  substituteDrugCode?: string;
  unitPrice?: string;
}

export interface SubmitPharmacyOrderQuoteInput {
  items: SubmitPharmacyOrderQuoteItemInput[];
  controlledSubstanceConfirmed?: boolean;
}

export interface SubmitPharmacyOrderQuoteResult {
  pharmacyOrderId: string;
  status: 'ACCEPTED' | 'SUBSTITUTION_PROPOSED';
  totalPrice: string;
  currency: string;
}

/**
 * File 10 lines 191-195 `POST /v1/pharmacy-orders/{orderId}/quote` / File
 * 11 Part 14 (`UNDER_REVIEW --> ACCEPTED|SUBSTITUTION_PROPOSED`). Only the
 * branch that won the broadcast (Part 39.13) may quote, and only while the
 * order is `UNDER_REVIEW` — same branch-resolution shape as
 * accept/decline. `estimatedReadyMinutes` (File 10's request) is
 * deliberately not accepted — no column exists to persist it, and adding
 * one is a schema decision for a future pass, not silently invented here.
 */
@Injectable()
export class SubmitPharmacyOrderQuoteUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderItemRepository) private readonly pharmacyOrderItems: PharmacyOrderItemRepository,
    @Inject(SubstitutionRepository) private readonly substitutions: SubstitutionRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetPrescriptionItemDrugCodesUseCase) private readonly getDrugCodes: GetPrescriptionItemDrugCodesUseCase,
    @Inject(GetDrugCatalogControlledStatusUseCase) private readonly getControlledStatus: GetDrugCatalogControlledStatusUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(pharmacyOrderId: string, input: SubmitPharmacyOrderQuoteInput, actor: AccessTokenPayload): Promise<SubmitPharmacyOrderQuoteResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active pharmacy branch assignment.');
    }
    const branchId = membership.contextId;

    for (const item of input.items) {
      assertValidQuoteItemInput(item);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order || order.pharmacy_branch_id !== branchId) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      if (order.status !== 'UNDER_REVIEW') {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_UNDER_REVIEW', 'This order is not awaiting a quote.');
      }

      const orderItems = await this.pharmacyOrderItems.findByOrderId(tx, pharmacyOrderId);
      const orderItemByPrescriptionItemId = new Map(orderItems.map((item) => [item.prescription_item_id, item]));

      const isBijection =
        input.items.length === orderItems.length && input.items.every((item) => orderItemByPrescriptionItemId.has(item.prescriptionItemId));
      if (!isBijection) {
        throw new BusinessRuleError('QUOTE_ITEMS_MISMATCH', "The quote must cover exactly this order's items, no more and no fewer.");
      }

      const originalDrugCodes = await this.getDrugCodes.execute(
        tx,
        orderItems.map((item) => item.prescription_item_id),
      );
      const effectiveDrugCodeByPrescriptionItemId = new Map(
        input.items.map((item) => [
          item.prescriptionItemId,
          item.status === 'SUBSTITUTED' ? item.substituteDrugCode! : (originalDrugCodes.get(item.prescriptionItemId) ?? ''),
        ]),
      );
      const controlledByCode = await this.getControlledStatus.execute(tx, [...effectiveDrugCodeByPrescriptionItemId.values()]);

      const needsConfirmation = requiresControlledSubstanceConfirmationForQuote(
        input.items.map((item) => ({ status: item.status, effectiveDrugCode: effectiveDrugCodeByPrescriptionItemId.get(item.prescriptionItemId)! })),
        controlledByCode,
      );
      if (needsConfirmation && !input.controlledSubstanceConfirmed) {
        throw new BusinessRuleError(
          'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED',
          'This order includes a controlled substance — controlledSubstanceConfirmed must be explicitly true to quote it.',
        );
      }

      const outcome = resolveQuoteOutcome(input.items);

      let totalPrice = 0;
      const newSubstitutions: NewSubstitution[] = [];
      for (const item of input.items) {
        const orderItem = orderItemByPrescriptionItemId.get(item.prescriptionItemId)!;
        await this.pharmacyOrderItems.updateQuote(tx, orderItem.id, orderItem.version, {
          status: item.status,
          unitPrice: item.status === 'UNAVAILABLE' ? null : (item.unitPrice ?? null),
          substitutedDrugCode: item.status === 'SUBSTITUTED' ? (item.substituteDrugCode ?? null) : null,
        });

        if (item.status !== 'UNAVAILABLE' && item.unitPrice) {
          totalPrice += Number(item.unitPrice) * orderItem.quantity;
        }
        if (item.status === 'SUBSTITUTED') {
          newSubstitutions.push({
            pharmacyOrderItemId: orderItem.id,
            originalDrugCode: originalDrugCodes.get(item.prescriptionItemId) ?? '',
            substitutedDrugCode: item.substituteDrugCode!,
            proposedByUserId: actor.sub,
          });
        }
      }
      if (newSubstitutions.length > 0) {
        await this.substitutions.createMany(tx, newSubstitutions);
      }

      await this.pharmacyOrders.setStatus(tx, pharmacyOrderId, order.version, outcome);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.quote',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      if (outcome === 'SUBSTITUTION_PROPOSED') {
        await this.outbox.emit(tx, 'SubstitutionProposed', { pharmacyOrderId });
      }

      return {
        pharmacyOrderId,
        status: outcome,
        totalPrice: totalPrice.toFixed(2),
        currency: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY,
      };
    });
  }
}
