import { Inject, Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { OffsetPageMeta, buildPageMeta, isOffsetMode, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AuditLogRepository } from '../infrastructure/audit-log.repository';

export interface ListAuditLogsInput {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  /** Admin console offset mode — takes precedence over cursor when present. */
  page?: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  reasonCode: string | null;
  correlationId: string | null;
  occurredAt: string;
}

export interface ListAuditLogsResult extends OffsetPageMeta {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

/**
 * Keyset cursor over `(occurred_at, id)` — the same pair the repository
 * orders by. Unlike `ListPharmacyAuditUseCase`'s offset cursor, nothing here
 * is filtered in memory over an enriched projection, so the keyset stays
 * correct as new rows land at the head of an append-only table mid-page.
 */
interface AuditLogCursor {
  o: string;
  i: string;
}

const DEFAULT_LIMIT = 50;

/**
 * File 12 Part 32.15: `audit_logs` is written in-transaction by every
 * module through `AuditService.record`, but until now had no platform-wide
 * read. ADMIN-only — this is the cross-module compliance view, distinct
 * from `pharmacy-fulfillment`'s `PHARMACY_STAFF` per-branch console, which
 * stays scoped to that branch's own orders.
 *
 * Raw projection by design: `action`/`resource_type` travel as the stored
 * strings rather than being mapped into a per-console vocabulary, because
 * an admin auditing across modules needs the row as it was written.
 */
@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogRepository) private readonly auditLogs: AuditLogRepository,
  ) {}

  async execute(input: ListAuditLogsInput): Promise<ListAuditLogsResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const cursor = decodeCursor<AuditLogCursor>(input.cursor);
    const offset = resolveOffset({ page: input.page, limit: input.limit });

    const filter = {
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
    };

    const offsetMode = isOffsetMode(input);
    const [rows, totalCount] = await Promise.all([
      this.auditLogs.list(
        this.prisma,
        offsetMode
          ? { ...filter, limit: offset.take, skip: offset.skip }
          : { ...filter, cursor: cursor ? { occurredAt: new Date(cursor.o), id: cursor.i } : undefined, limit: limit + 1 },
      ),
      this.auditLogs.count(this.prisma, { ...filter, limit }),
    ]);

    const hasMore = !offsetMode && rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    return {
      entries: pageRows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        reasonCode: row.reason_code,
        correlationId: row.correlation_id,
        occurredAt: row.occurred_at.toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor<AuditLogCursor>({ o: last.occurred_at.toISOString(), i: last.id })
          : null,
      ...buildPageMeta(totalCount, offsetMode ? offset.page : 1, offsetMode ? offset.limit : limit),
    };
  }
}
