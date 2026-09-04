import { Inject, Injectable } from '@nestjs/common';
import { PharmacyOrder } from '@prisma/client';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase, UserSummary } from '../../identity-auth/application/get-user-summary.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyOrderRepository } from '../infrastructure/pharmacy-order.repository';

export const PHARMACY_AUDIT_ACTIONS = [
  'ORDER_RECEIVED',
  'QUOTE_SENT',
  'ORDER_REJECTED',
  'MARKED_READY',
  'HANDED_TO_COURIER',
  'COMPLETED',
  'CANCELLED',
] as const;

export type PharmacyAuditAction = (typeof PHARMACY_AUDIT_ACTIONS)[number];

export interface ListPharmacyAuditInput {
  search?: string;
  action?: PharmacyAuditAction;
  cursor?: string;
  limit?: number;
}

export interface PharmacyAuditEntry {
  id: string;
  at: string;
  action: PharmacyAuditAction;
  actorName: string | null;
  orderId: string;
  patientName: string;
  detail: string | null;
  /** Always `true` here — every row is a real `audit_logs` write, never a projection. Mirrors `medsuper-pharmacy-dashboard`'s mock field, which uses `false` only for its own pre-seeded, timestamp-reconstructed entries; that concept doesn't exist server-side. */
  recorded: true;
}

export interface ListPharmacyAuditResult {
  entries: PharmacyAuditEntry[];
  nextCursor: string | null;
  total: number;
}

interface AuditOffsetCursor {
  offset: number;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

/**
 * Raw `audit_logs.action` suffix (this module always writes
 * `pharmacy-fulfillment.<resource>.<verb>`) -> the dashboard's own audit
 * vocabulary (`AuditAction` in `medsuper-pharmacy-dashboard/src/lib/api/types.ts`).
 * Broadcast accept/decline, the patient's payment `approve`, and the
 * (practically unreachable) substitution-reject aren't part of that
 * vocabulary — filtered out below, not mapped, same "unreachable/out of
 * scope for this console" precedent as `SUBSTITUTION_PROPOSED`.
 * `pharmacy-order.fulfill` is deliberately absent here: its resolution
 * depends on the order's `fulfillment_type`, not just the action string, so
 * it is handled directly in `resolveAction`.
 */
const ACTION_SUFFIX_MAP: Partial<Record<string, PharmacyAuditAction>> = {
  'pharmacy-order.create': 'ORDER_RECEIVED',
  'pharmacy-order.quote': 'QUOTE_SENT',
  'pharmacy-order.reject': 'ORDER_REJECTED',
  'pharmacy-order.complete': 'COMPLETED',
};

function resolveAction(rawAction: string, order: PharmacyOrder): PharmacyAuditAction | null {
  const suffix = rawAction.replace(/^pharmacy-fulfillment\./, '');
  if (suffix === 'pharmacy-order.fulfill') {
    return order.fulfillment_type === 'DELIVERY' ? 'HANDED_TO_COURIER' : 'MARKED_READY';
  }
  return ACTION_SUFFIX_MAP[suffix] ?? null;
}

/**
 * No new column/migration needed for this: `quote`/`reject`'s existing flat
 * columns already carry everything a detail string needs
 * (`total_price`/`currency`, `rejection_reason`/`rejection_note`), and each
 * transition happens at most once per order (`SubmitPharmacyOrderQuoteUseCase`
 * refuses a second quote, `RejectPharmacyOrderUseCase`'s reject is terminal)
 * — so reading the order's CURRENT row for a `QUOTE_SENT`/`ORDER_REJECTED`
 * entry is equivalent to having captured the detail at write time.
 * `MARKED_READY`/`HANDED_TO_COURIER`/`COMPLETED` carry no note column on
 * `pharmacy_orders` (`fulfill`/`complete` are pure status flips, see
 * `lifecycle-transition.dto.ts`) — `null` here is the honest live-mode
 * answer, not a gap the mock happens to fill in.
 */
function detailFor(action: PharmacyAuditAction, order: PharmacyOrder): string | null {
  switch (action) {
    case 'QUOTE_SENT':
      return order.total_price !== null ? `${order.total_price.toFixed(2)} ${order.currency ?? 'EGP'}` : null;
    case 'ORDER_REJECTED':
      return order.rejection_note?.trim() || order.rejection_reason || null;
    default:
      return null;
  }
}

/**
 * `PH-C1E102`-style code the frontend derives from `orderId`
 * (`shortOrderCode`, `src/lib/utils/format.ts`) — reproduced here ONLY for
 * server-side search matching, never returned on the wire. `orderCode` stays
 * a frontend-only presentation value, same "derived, not a backend field"
 * rule the dashboard already documents on its own helper.
 */
function shortOrderCode(orderId: string): string {
  return `PH-${orderId.replace(/-/g, '').toUpperCase().slice(-6)}`;
}

/**
 * `GET /pharmacy-audit` (`docs/PROPOSED_CONTRACT.md` §6, resolved
 * 2026-08-29) — every mapped lifecycle action across every order this
 * branch has owned, newest first. `PHARMACY_STAFF` only: this console has no
 * patient-facing surface (ADR-006), so unlike `ListPharmacyOrdersUseCase`
 * there is no patient-scoped case to support here.
 *
 * Reads `audit_logs` (owned by the `audit` module, File 11 Part 03) only
 * through `AuditService.listByResource` — never `AuditLogRepository`
 * directly (File 12 Part 05's "no cross-module infrastructure reach").
 * Enrichment joins back to this module's own `pharmacy_orders` for the
 * order/patient/detail projection, the same shape of join
 * `ListPharmacyOrdersUseCase`'s `enrich` step already does across module
 * lines via `identity-auth`'s `GetUserSummaryUseCase`.
 *
 * Filtering (`search`/`action`) and pagination both happen in memory over
 * this branch's full audit history rather than as a database query, because
 * both depend on the resolved, enriched entry (patient name, the computed
 * order code, the per-action `detail` string) — not on any single indexed
 * column `audit_logs` or `pharmacy_orders` could filter on directly. This is
 * an accepted MVP-scale tradeoff, the same reasoning already documented on
 * `ListPharmacyOrdersUseCase`'s per-row enrichment N+1.
 */
@Injectable()
export class ListPharmacyAuditUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyOrderRepository) private readonly pharmacyOrders: PharmacyOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: ListPharmacyAuditInput, actor: AccessTokenPayload): Promise<ListPharmacyAuditResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'PHARMACY_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع صيدلية نشِط.');
    }

    const orders = await this.pharmacyOrders.findAllForBranch(this.prisma, membership.contextId);
    if (orders.length === 0) {
      return { entries: [], nextCursor: null, total: 0 };
    }
    const orderById = new Map(orders.map((order) => [order.id, order]));

    const logs = await this.audit.listByResource(this.prisma, 'pharmacy_order', [...orderById.keys()]);

    const userIds = new Set<string>();
    for (const order of orders) userIds.add(order.patient_id);
    for (const log of logs) if (log.actor_user_id) userIds.add(log.actor_user_id);
    const summaries = await Promise.all([...userIds].map((id) => this.getUserSummary.execute(this.prisma, id)));
    const userById = new Map<string, UserSummary>();
    for (const summary of summaries) if (summary) userById.set(summary.id, summary);

    const displayName = (userId: string | null): string | null => {
      if (!userId) return null;
      const user = userById.get(userId);
      if (!user) return null;
      return [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    };

    const entries: PharmacyAuditEntry[] = [];
    for (const log of logs) {
      const order = orderById.get(log.resource_id);
      if (!order) continue; // resourceIds came from orderById's own keys — defensive only
      const action = resolveAction(log.action, order);
      if (!action) continue; // not part of this console's audit vocabulary

      entries.push({
        id: log.id,
        at: log.occurred_at.toISOString(),
        action,
        actorName: displayName(log.actor_user_id),
        orderId: order.id,
        patientName: displayName(order.patient_id) ?? 'مريض غير معروف',
        detail: detailFor(action, order),
        recorded: true,
      });
    }

    let filtered = entries;
    if (input.action) {
      filtered = filtered.filter((entry) => entry.action === input.action);
    }
    const search = input.search?.trim().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (entry) =>
          shortOrderCode(entry.orderId).toLowerCase().includes(search) ||
          entry.patientName.toLowerCase().includes(search) ||
          (entry.detail ?? '').toLowerCase().includes(search),
      );
    }

    const total = filtered.length;
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const decoded = decodeCursor<AuditOffsetCursor>(input.cursor)?.offset;
    const start = typeof decoded === 'number' && Number.isFinite(decoded) && decoded > 0 ? decoded : 0;
    const page = filtered.slice(start, start + limit);
    const nextOffset = start + limit;

    return {
      entries: page,
      nextCursor: nextOffset < total ? encodeCursor<AuditOffsetCursor>({ offset: nextOffset }) : null,
      total,
    };
  }
}
