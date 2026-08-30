import { Inject, Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
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
    @Inject(AuditLogRepository) private readonly repository: AuditLogRepository,
    @Inject(RequestContextService) private readonly context: RequestContextService,
  ) {}

  async record(tx: Prisma.TransactionClient, params: RecordAuditParams): Promise<void> {
    await this.repository.create(tx, {
      ...params,
      correlationId: this.context.correlationId,
    });
  }

  /**
   * Read side (2026-08-29, `docs/PROPOSED_CONTRACT.md` §6 in
   * `medsuper-pharmacy-dashboard` — first caller is `pharmacy-fulfillment`'s
   * `ListPharmacyAuditUseCase`). The only sanctioned way for another module
   * to read `audit_logs` — never `AuditLogRepository` directly (File 12 Part
   * 05's "no cross-module infrastructure reach"). Plain `PrismaService` read,
   * not `tx`-scoped, same "authorization/reporting lookup, not a
   * same-snapshot-as-a-write requirement" reasoning as
   * `GetActiveRoleMembershipUseCase`.
   */
  async listByResource(db: Prisma.TransactionClient, resourceType: string, resourceIds: string[]): Promise<AuditLog[]> {
    return this.repository.findByResource(db, resourceType, resourceIds);
  }
}
