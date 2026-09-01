import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { ListLabAuditResult, ListLabAuditUseCase } from '../application/list-lab-audit.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { ListLabAuditQueryDto } from './dto/list-lab-audit-query.dto';

/** Sibling resource to `lab-orders`, not nested under it — mirrors `pharmacy-audit`'s own precedent (File 12 Part 43). `LAB_STAFF` only: no patient-facing surface (ADR-006). */
@ApiTags('lab-audit')
@ApiBearerAuth()
@Controller('lab-audit')
export class LabAuditController {
  constructor(@Inject(ListLabAuditUseCase) private readonly listLabAudit: ListLabAuditUseCase) {}

  @Roles(RoleContextType.LAB_STAFF)
  @Get()
  @ApiOperation({ summary: "Every custody event across every order the caller's branch has owned, newest first — read-only" })
  list(@Query() query: ListLabAuditQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListLabAuditResult> {
    return this.listLabAudit.execute(query, user);
  }
}
