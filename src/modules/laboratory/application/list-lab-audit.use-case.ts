import { Inject, Injectable } from '@nestjs/common';
import { LabOrder } from '@prisma/client';
import { GetActiveRoleMembershipUseCase } from '../../identity-auth/application/get-active-role-membership.use-case';
import { GetUserSummaryUseCase, UserSummary } from '../../identity-auth/application/get-user-summary.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CustodyEventType, decodeCustodyAction } from '../domain/custody-action.util';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

export interface ListLabAuditInput {
  search?: string;
  action?: CustodyEventType;
  cursor?: string;
  limit?: number;
}

export interface LabAuditEntry {
  id: string;
  at: string;
  action: CustodyEventType;
  actorName: string | null;
  orderId: string;
  patientName: string;
  detail: string | null;
}

export interface ListLabAuditResult {
  entries: LabAuditEntry[];
  nextCursor: string | null;
  total: number;
}

interface AuditOffsetCursor {
  offset: number;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

/** `PH-C1E102`-equivalent for lab orders — matches the dashboard's own `shortOrderCode`-style derivation (`LAB-<last 6 hex>`), reproduced here only for server-side search matching, never returned on the wire. */
function shortOrderCode(orderId: string): string {
  return `LAB-${orderId.replace(/-/g, '').toUpperCase().slice(-6)}`;
}

/**
 * `GET /lab-audit` — every custody event across every order this branch has
 * owned, newest first. `LAB_STAFF` only. Direct sibling to
 * `ListPharmacyAuditUseCase`, simpler in one respect: `detail` is read
 * straight off `audit_logs.reason_code` (populated at write time by every
 * laboratory use-case) rather than reconstructed from the order's current
 * row — lab custody events recur (multiple notes, multiple per-item
 * results, possible reject/recollect cycles), so unlike pharmacy's one-shot
 * quote/reject, there is no single "current state" to reconstruct from.
 *
 * `search`/`action` filtering and pagination happen in memory over this
 * branch's full audit history, same accepted MVP-scale tradeoff
 * `ListPharmacyAuditUseCase` already documents.
 */
@Injectable()
export class ListLabAuditUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(GetActiveRoleMembershipUseCase) private readonly getActiveRoleMembership: GetActiveRoleMembershipUseCase,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: ListLabAuditInput, actor: AccessTokenPayload): Promise<ListLabAuditResult> {
    const membership = await this.getActiveRoleMembership.execute(actor.sub, 'LAB_STAFF');
    if (!membership || !membership.contextId) {
      throw new ForbiddenError('FORBIDDEN', 'هذا الحساب غير مرتبط بفرع معمل نشِط.');
    }

    const orders = await this.labOrders.findAllForBranch(this.prisma, membership.contextId);
    if (orders.length === 0) {
      return { entries: [], nextCursor: null, total: 0 };
    }
    const orderById = new Map<string, LabOrder>(orders.map((order) => [order.id, order]));

    const logs = await this.audit.listByResource(this.prisma, 'lab_order', [...orderById.keys()]);

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

    const entries: LabAuditEntry[] = [];
    for (const log of logs) {
      const order = orderById.get(log.resource_id);
      if (!order) continue; // resourceIds came from orderById's own keys — defensive only
      const action = decodeCustodyAction(log.action);
      if (!action) continue; // not written by this module

      entries.push({
        id: log.id,
        at: log.occurred_at.toISOString(),
        action,
        actorName: displayName(log.actor_user_id),
        orderId: order.id,
        patientName: displayName(order.patient_id) ?? 'مريض غير معروف',
        detail: log.reason_code ?? null,
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
