import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AuditLogRepository } from './infrastructure/audit-log.repository';

/**
 * File 11 Part 03: owns `audit_logs`, append-only, written in the same
 * transaction as the business action it records — never async-only.
 * Exports `AuditService` for every other module to call (first consumer:
 * provider-directory's verification workflow, File 12 Part 32.15).
 */
@Module({
  providers: [AuditService, AuditLogRepository],
  exports: [AuditService],
})
export class AuditModule {}
