import { Module } from '@nestjs/common';
import { AuditLogsController } from './api/audit-logs.controller';
import { AuditService } from './application/audit.service';
import { ListAuditLogsUseCase } from './application/list-audit-logs.use-case';
import { AuditLogRepository } from './infrastructure/audit-log.repository';

/**
 * File 11 Part 03: owns `audit_logs`, append-only, written in the same
 * transaction as the business action it records — never async-only.
 * Exports `AuditService` for every other module to call (first consumer:
 * provider-directory's verification workflow, File 12 Part 32.15).
 *
 * `AuditLogsController` is this module's own ADMIN read surface; it stays
 * here rather than in a consumer module because `audit_logs` is this
 * module's table (File 12 Part 05's "no cross-module infrastructure
 * reach"), and it is the only caller of `ListAuditLogsUseCase`, which is
 * therefore not exported.
 */
@Module({
  controllers: [AuditLogsController],
  providers: [AuditService, ListAuditLogsUseCase, AuditLogRepository],
  exports: [AuditService],
})
export class AuditModule {}
