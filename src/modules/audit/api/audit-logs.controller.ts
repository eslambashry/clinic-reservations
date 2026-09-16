import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { ListAuditLogsResult, ListAuditLogsUseCase } from '../application/list-audit-logs.use-case';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Platform-wide compliance read over `audit_logs` (File 12 Part 32.15).
 * ADMIN-only and deliberately NOT namespaced under `/admin` — authorization
 * is the `@Roles` decorator, never the URL. `pharmacy-fulfillment`'s
 * `GET /v1/pharmacy-audit` remains the separate `PHARMACY_STAFF` console
 * view of that branch's own orders; an ADMIN token cannot reach it, and
 * this route is the cross-module answer instead.
 */
@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(@Inject(ListAuditLogsUseCase) private readonly listAuditLogs: ListAuditLogsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Admin: platform-wide audit trail, newest first — read-only' })
  list(@Query() query: ListAuditLogsQueryDto): Promise<ListAuditLogsResult> {
    return this.listAuditLogs.execute(query);
  }
}
