import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { decodeCustodyAction } from '../domain/custody-action.util';
import { CustodyEventDetail } from './lab-order-detail.mapper';

/**
 * Batched custody-timeline read for one or more `LabOrder`s — one
 * `AuditService.listByResource` call regardless of how many order ids are
 * passed, so `ListLabOrdersUseCase`'s per-row enrichment doesn't turn into a
 * second N+1 on top of the patient/prescription one
 * `ListPharmacyOrdersUseCase` already accepts as an MVP tradeoff.
 *
 * Returned ascending (oldest first) per order — the order drawer's
 * `custody-timeline.tsx` reads chronologically, matching the mock's own
 * append-only `custodyEvents` array. `ListLabAuditUseCase` (newest-first,
 * cross-order, search/paginated) does its own independent read instead of
 * reusing this — different enough shape that sharing would mean threading a
 * sort-order flag through for one call site, not a real simplification.
 */
@Injectable()
export class GetCustodyEventsUseCase {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GetUserSummaryUseCase) private readonly getUserSummary: GetUserSummaryUseCase,
  ) {}

  async executeForOrders(db: Prisma.TransactionClient, labOrderIds: string[]): Promise<Map<string, CustodyEventDetail[]>> {
    const byOrder = new Map<string, CustodyEventDetail[]>();
    if (labOrderIds.length === 0) {
      return byOrder;
    }

    const logs = await this.audit.listByResource(db, 'lab_order', labOrderIds);

    const actorIds = [...new Set(logs.map((l) => l.actor_user_id).filter((id): id is string => Boolean(id)))];
    const summaries = await Promise.all(actorIds.map((id) => this.getUserSummary.execute(db, id)));
    const nameById = new Map<string, string>();
    for (const summary of summaries) {
      if (summary) {
        const name = [summary.firstName, summary.lastName].filter(Boolean).join(' ');
        if (name) nameById.set(summary.id, name);
      }
    }

    for (const log of logs) {
      const type = decodeCustodyAction(log.action);
      if (!type) continue; // not written by this module — defensive only, resourceType already scopes the query
      const event: CustodyEventDetail = {
        id: log.id,
        orderId: log.resource_id,
        type,
        at: log.occurred_at.toISOString(),
        actorName: log.actor_user_id ? (nameById.get(log.actor_user_id) ?? null) : null,
        note: log.reason_code ?? null,
      };
      const list = byOrder.get(event.orderId) ?? [];
      list.push(event);
      byOrder.set(event.orderId, list);
    }

    // `listByResource` orders newest-first; the timeline reads chronologically.
    for (const list of byOrder.values()) {
      list.reverse();
    }

    return byOrder;
  }
}
