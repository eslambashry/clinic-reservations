import { Inject, Injectable } from '@nestjs/common';
import { PharmacyOrderRejectionReason, PharmacyOrderStatus } from '@prisma/client';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderBroadcastRepository } from '../infrastructure/pharmacy-order-broadcast.repository';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

/** UNDER_REVIEW (pre-quote) or ACCEPTED (quoted, awaiting patient payment) — matches `medsuper-pharmacy-dashboard`'s own REJECTABLE set. */
const REJECTABLE_STATUSES: PharmacyOrderStatus[] = ['UNDER_REVIEW', 'ACCEPTED'];

export interface RejectPharmacyOrderInput {
  /** Required for this (PHARMACY_STAFF) path — optional at the DTO layer only because the route is shared with the PATIENT substitution-reject path, which sends no body at all. */
  reason?: PharmacyOrderRejectionReason;
  note?: string;
}

export interface RejectPharmacyOrderResult {
  pharmacyOrderId: string;
  /**
   * The order's real status after this call. Declining an unclaimed broadcast
   * doesn't touch the order row at all (it's still open to other branches),
   * so this stays `RECEIVED` — there is no `DECLINED` member on
   * `PharmacyOrderStatus`, only the per-branch `BroadcastResponse` changes.
   * `REJECTED` only when this branch's already-claimed order was rejected
   * outright.
   */
  status: PharmacyOrderStatus;
}

/**
 * 2026-08-29 addition — `PHARMACY_STAFF` decides against an order the
 * dashboard's UI never distinguishes by claim state (same "no separate
 * accept step" reasoning as `submit-pharmacy-order-quote.use-case.ts`):
 *
 * - This branch's own broadcast row is still unresponded: this is a
 *   **decline** — marks it `DECLINED` (File 11 line 456's "loser simply sees
 *   the order disappear from their queue"; the order row itself is
 *   untouched, whatever its current claim state). No `reason`/`note`
 *   persisted — declines were never modeled as carrying one.
 * - Already claimed by this branch, still `UNDER_REVIEW` (not yet quoted):
 *   this is the original whole-order **reject** (`--> REJECTED`, File 11
 *   Part 14), the flow the old item-based quote endpoint used to reach only
 *   indirectly (`422 NO_ITEMS_AVAILABLE` when every item was `UNAVAILABLE` —
 *   impossible now that quoting has no items).
 * - Already `ACCEPTED` (quoted, awaiting the patient's payment): the
 *   dashboard's own `REJECTABLE` set allows staff to pull an order back here
 *   too (e.g. the patient is unresponsive) — same `--> REJECTED` transition,
 *   just from one status later.
 *   Both claimed-order branches require `reason`/`note`, persisted here.
 *
 * Distinct from `RejectPharmacyOrderSubstitutionUseCase` (patient-initiated,
 * no body, `SUBSTITUTION_PROPOSED --> REJECTED`) — the controller dispatches
 * between the two by the caller's role, since both hang off `POST .../reject`.
 */
@Injectable()
export class RejectPharmacyOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(PharmacyOrderBroadcastRepository) private readonly broadcasts: PharmacyOrderBroadcastRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyOrderId: string, input: RejectPharmacyOrderInput, actor: AccessTokenPayload): Promise<RejectPharmacyOrderResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'This account has no active pharmacy branch assignment.');
    }
    const branchId = membership.contextId;

    return this.prisma.$transaction(async (tx) => {
      const order = await this.pharmacyOrders.findById(tx, pharmacyOrderId);
      if (!order) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }

      // Keyed off the broadcast row's own state, not the order's current claim
      // status: a branch that never got around to responding can still
      // decline even after another branch won the race in the meantime
      // (File 11 line 456 — multiple simultaneous broadcasts are normal;
      // same behavior the original, now-unused `DeclinePharmacyOrderBroadcastUseCase` had).
      const broadcast = await this.broadcasts.findByOrderAndBranch(tx, pharmacyOrderId, branchId);
      if (broadcast && broadcast.response === null) {
        const declined = await this.broadcasts.markResponded(tx, broadcast.id, 'DECLINED');
        if (!declined) {
          throw new ConflictError('BROADCAST_ALREADY_RESPONDED', 'This branch has already responded to this order.');
        }

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'pharmacy-fulfillment.pharmacy-order-broadcast.decline',
          resourceType: 'pharmacy_order',
          resourceId: pharmacyOrderId,
        });

        return { pharmacyOrderId, status: order.status };
      }

      if (order.pharmacy_branch_id !== branchId) {
        throw new NotFoundError('PharmacyOrder', pharmacyOrderId);
      }
      if (!REJECTABLE_STATUSES.includes(order.status)) {
        throw new BusinessRuleError('PHARMACY_ORDER_NOT_REJECTABLE', 'This order is not awaiting a decision.');
      }
      const reason = input.reason;
      if (!reason) {
        throw new BusinessRuleError('REJECTION_REASON_REQUIRED', 'reason is required to reject a claimed order.');
      }

      await this.pharmacyOrders.rejectOrder(tx, pharmacyOrderId, order.version, { reason, note: input.note ?? null });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'pharmacy-fulfillment.pharmacy-order.reject',
        resourceType: 'pharmacy_order',
        resourceId: pharmacyOrderId,
      });

      return { pharmacyOrderId, status: 'REJECTED' as const };
    });
  }
}
