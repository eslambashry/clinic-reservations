import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';

export interface ListAuditLogsFilter {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  cursor?: { occurredAt: Date; id: string };
  limit: number;
  /** Offset mode (admin console only) — when set, the cursor branch is skipped. */
  skip?: number;
}

export interface CreateAuditLogParams {
  actorUserId?: string;
  actorRoleMembershipId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  subjectPatientId?: string;
  reasonCode?: string;
  correlationId?: string;
  sourceIp?: string;
}

@Injectable()
export class AuditLogRepository {
  create(db: Prisma.TransactionClient, params: CreateAuditLogParams): Promise<AuditLog> {
    return db.auditLog.create({
      data: {
        actor_user_id: params.actorUserId,
        actor_role_membership_id: params.actorRoleMembershipId,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        subject_patient_id: params.subjectPatientId,
        reason_code: params.reasonCode,
        correlation_id: params.correlationId,
        source_ip: params.sourceIp,
      },
    });
  }

  /**
   * Read side (2026-08-29, `medsuper-pharmacy-dashboard` §6 — first consumer
   * is `pharmacy-fulfillment`'s `ListPharmacyAuditUseCase`). Unpaginated by
   * design: callers own filtering/paging semantics for their own resource
   * (e.g. free-text search over an enriched projection this table knows
   * nothing about) — this method's only job is "every log row for these
   * resource ids," newest first.
   */
  findByResource(db: Prisma.TransactionClient, resourceType: string, resourceIds: string[]): Promise<AuditLog[]> {
    if (resourceIds.length === 0) {
      return Promise.resolve([]);
    }
    return db.auditLog.findMany({
      where: { resource_type: resourceType, resource_id: { in: resourceIds } },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * Platform-wide keyset read (ADMIN console, File 12 Part 32.15). Ordered
   * by `(occurred_at, id)` desc so the cursor's compound comparison is a
   * strict continuation of that same ordering — `id` breaks ties between
   * rows sharing a timestamp, which `@default(now())` makes likely for
   * several writes inside one transaction.
   */
  list(db: Prisma.TransactionClient, filter: ListAuditLogsFilter): Promise<AuditLog[]> {
    return db.auditLog.findMany({
      where: buildListWhere(filter),
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      ...(filter.skip !== undefined && { skip: filter.skip }),
    });
  }

  /** Total rows matching the same filter, ignoring pagination. */
  count(db: Prisma.TransactionClient, filter: ListAuditLogsFilter): Promise<number> {
    return db.auditLog.count({ where: buildListWhere(filter) });
  }
}

/**
 * Shared so `list` and `count` can never drift apart — a count computed over a
 * different filter than the page would report a wrong total page count.
 * The cursor predicate is excluded in offset mode, where `skip` positions instead.
 */
function buildListWhere(filter: ListAuditLogsFilter): Prisma.AuditLogWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (filter.from) {
    occurredAt.gte = filter.from;
  }
  if (filter.to) {
    occurredAt.lte = filter.to;
  }

  return {
    ...(filter.actorUserId ? { actor_user_id: filter.actorUserId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.resourceType ? { resource_type: filter.resourceType } : {}),
    ...(filter.resourceId ? { resource_id: filter.resourceId } : {}),
    ...(filter.from || filter.to ? { occurred_at: occurredAt } : {}),
    ...(filter.skip === undefined && filter.cursor
      ? {
          OR: [
            { occurred_at: { lt: filter.cursor.occurredAt } },
            { occurred_at: filter.cursor.occurredAt, id: { lt: filter.cursor.id } },
          ],
        }
      : {}),
  };
}
