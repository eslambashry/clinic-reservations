import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { AuditLogRepository, CreateAuditLogParams } from '../infrastructure/audit-log.repository';

export type RecordAuditParams = Omit<CreateAuditLogParams, 'correlationId'>;

/**
 * File 12 Part 07 / Part 32.15: "written inside the SAME Prisma transaction
 * as the business state change... via an AuditService called from the
 * application-layer use-case — never from the outbox." Callers pass the
 * same `tx` they used for the business write; `correlation_id` is filled in
 * automatically from `RequestContextService` so call sites never have to
 * thread it through manually.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly context: RequestContextService,
  ) {}

  async record(tx: Prisma.TransactionClient, params: RecordAuditParams): Promise<void> {
    await this.repository.create(tx, {
      ...params,
      correlationId: this.context.correlationId,
    });
  }
}
