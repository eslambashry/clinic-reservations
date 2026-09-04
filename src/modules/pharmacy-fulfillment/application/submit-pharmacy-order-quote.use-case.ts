import { Inject, Injectable } from '@nestjs/common';
import { GetDrugCatalogControlledStatusUseCase } from '../../prescriptions/application/get-drug-catalog-controlled-status.use-case';
import { GetPrescriptionItemDrugCodesUseCase } from '../../prescriptions/application/get-prescription-item-drug-codes.use-case';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PROVIDER_REGISTRATION_CONSTANTS } from '../../../shared/config/constants';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { assertValidFlatQuoteInput } from '../domain/pharmacy-order-quote.rules';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderItemRepository } from '../infrastructure/pharmacy-order-item.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export interface SubmitPharmacyOrderQuoteInput {
  totalPrice: string;
  estimatedReadyMinutes: number;
  note?: string;
  controlledSubstanceConfirmed?: boolean;
}

export interface SubmitPharmacyOrderQuoteResult {
  pharmacyOrderId: string;
  status: 'ACCEPTED';
  totalPrice: string;
  currency: string;
}

/**
 * 2026-08-29 rewrite (File 12 Part 39 follow-up, `docs/PROPOSED_CONTRACT.md`
 * §1 resolved in `medsuper-pharmacy-dashboard`'s favor over the original
 * item-by-item quote contract): the pharmacist types one total, one ETA, and
 * an optional note — no `PharmacyOrderItem` pricing, no substitution
 * proposals. `SUBSTITUTION_PROPOSED` stays in the schema for forward-compat
 * but no code path here produces it any more (same "unreachable enum
 * member" precedent as `AppointmentStatus.HELD`).
 *
 * Also folds in the accept/claim step: the dashboard's UI never had a
 * separate "accept this broadcast" action — a pharmacist quotes (or rejects,
 * see `reject-pharmacy-order.use-case.ts`) directly on a `RECEIVED` order,
 * same as on an already-claimed `UNDER_REVIEW` one. So when the order is
 * still unclaimed, this use-case claims it first (the same first-accept-wins
 * conditional update `AcceptPharmacyOrderBroadcastUseCase` uses, File 11 line
 * 456) and then quotes it, inside one transaction — the intermediate
 * `UNDER_REVIEW` hop is real but never separately observable, same "not
 * decoupled" reasoning File 10 Part 8.1 already established for `approve`'s
 * two hops. `AcceptPharmacyOrderBroadcastUseCase`/`.../accept` still exist
 * as a documented, separately-callable primitive — just unused by this
 * console.
 */
@Injectable()
export class SubmitPharmacyOrderQuoteUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderItemRepository) private readonly pharmacyOrderItems: PharmacyOrderItemRepository,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetPrescriptionItemDrugCodesUseCase) private readonly getDrugCodes: GetPrescriptionItemDrugCodesUseCase,
    @Inject(GetDrugCatalogControlledStatusUseCase) private readonly getControlledStatus: GetDrugCatalogControlledStatusUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(pharmacyOrderId: string, input: SubmitPharmacyOrderQuoteInput, actor: AccessTokenPayload): Promise<SubmitPharmacyOrderQuoteResult> {
    assertValidFlatQuoteInput(input);

    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع صيدلية نشِط.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }

      let currentVersion = order.version;
      let status = order.status;

      if (order.pharmacy_branch_id === null) {
        // Unclaimed — this branch must have been a broadcast target, and
        // claiming it here folds in what used to be a separate `accept` call.
        const broadcast = await this.broadcasts.findByOrderAndBranch(tx, pharmacyOrderId, branchId);
        if (!broadcast || broadcast.response !== null) {
          throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
        }
        const claimed = await this.pharmacyOrders.claimForBranch(tx, pharmacyOrderId, order.version, branchId);
        if (!claimed) {
          throw new ConflictError('ORDER_ALREADY_CLAIMED', 'استلم فرع صيدلية آخر هذا الطلب قبلك.');
        }
        await this.broadcasts.markResponded(tx, broadcast.id, 'ACCEPTED');
        await this.outbox.emit(tx, 'PharmacyOrderAccepted', { pharmacyOrderId, pharmacyBranchId: branchId });
        currentVersion += 1;
        status = 'UNDER_REVIEW';
      } else if (order.pharmacy_branch_id !== branchId) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }

      if (status !== 'UNDER_REVIEW') {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_UNDER_REVIEW', 'هذا الطلب ليس في انتظار تسعير.');
      }

      // File 10 line 541: still enforced even without per-item substitution —
      // check the order's ORIGINAL prescribed drugs (no substitute path exists
      // in the flat-quote flow) and require explicit confirmation if any is
      // controlled.
      const orderItems = await this.pharmacyOrderItems.findByOrderId(tx, pharmacyOrderId);
      const drugCodesByPrescriptionItemId = await this.getDrugCodes.execute(
        tx,
        orderItems.map((item) => item.prescription_item_id),
      );
      const controlledByCode = await this.getControlledStatus.execute(tx, [...drugCodesByPrescriptionItemId.values()]);
      const includesControlledSubstance = [...drugCodesByPrescriptionItemId.values()].some((code) => controlledByCode.get(code) ?? false);
      if (includesControlledSubstance && !input.controlledSubstanceConfirmed) {
        throw new BusinessRuleError(
          'CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED',
          'يشمل هذا الطلب دواءً خاضعًا للرقابة. يلزم تأكيد صريح من الصيدلي قبل التسعير.',
        );
      }

      const currency = PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY;
      await this.pharmacyOrders.submitQuote(tx, pharmacyOrderId, currentVersion, {
        totalPrice: input.totalPrice,
        currency,
        estimatedReadyMinutes: input.estimatedReadyMinutes,
        note: input.note ?? null,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.quote',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      await this.outbox.emit(tx, 'PharmacyOrderQuoted', { pharmacyOrderId, totalPrice: input.totalPrice, currency });

      return { pharmacyOrderId, status: 'ACCEPTED' as const, totalPrice: input.totalPrice, currency };
    });
  }
}
