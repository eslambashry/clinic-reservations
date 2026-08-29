import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { ListPharmacyAuditResult, ListPharmacyAuditUseCase } from '../application/list-pharmacy-audit.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { ListPharmacyAuditQueryDto } from './dto/list-pharmacy-audit-query.dto';

/**
 * `docs/PROPOSED_CONTRACT.md` §6 (`medsuper-pharmacy-dashboard`), resolved
 * 2026-08-29 — a sibling resource to `pharmacy-orders`, not nested under it
 * (the dashboard's own contract names it `GET /v1/pharmacy-audit`).
 * `PHARMACY_STAFF` only: this console has no patient-facing surface
 * (ADR-006).
 */
@ApiTags('pharmacy-audit')
@ApiBearerAuth()
@Controller('pharmacy-audit')
export class PharmacyAuditController {
  constructor(@Inject(ListPharmacyAuditUseCase) private readonly listPharmacyAudit: ListPharmacyAuditUseCase) {}

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Get()
  @ApiOperation({ summary: "Every mapped lifecycle action across every order the caller's branch has owned, newest first — read-only" })
  list(@Query() query: ListPharmacyAuditQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListPharmacyAuditResult> {
    return this.listPharmacyAudit.execute(query, user);
  }
}
