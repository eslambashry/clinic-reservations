import { Body, Controller, Get, Inject, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PolicyType, RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../core/auth/jwt-payload.interface';
import { Roles } from '../../core/auth/roles.decorator';
import { ListPolicyConfigsResult, ListPolicyConfigsUseCase, PolicyConfigSummary } from './list-policy-configs.use-case';
import { parsePolicyType } from './policy-config.rules';
import { ListPolicyConfigsQueryDto } from './dto/list-policy-configs-query.dto';
import { UpsertPolicyConfigDto } from './dto/upsert-policy-config.dto';
import { UpsertPolicyConfigUseCase } from './upsert-policy-config.use-case';

/**
 * Admin surface for `policy_configs` (File 12 Part 36.1 — the write side
 * this table's `created_by` column was always designed for, previously
 * reachable only through `src/db/seed.ts`). ADMIN-only via `@Roles`, not a
 * `/admin` URL prefix.
 *
 * `:policyType` is validated against the Prisma enum by hand rather than
 * with `ParseEnumPipe` so the rejection is the standard domain-error
 * envelope, consistent with the body validation in `policy-config.rules.ts`.
 */
@ApiTags('policy-configs')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('policy-configs')
export class PolicyConfigsController {
  constructor(
    @Inject(ListPolicyConfigsUseCase) private readonly listPolicyConfigs: ListPolicyConfigsUseCase,
    @Inject(UpsertPolicyConfigUseCase) private readonly upsertPolicyConfig: UpsertPolicyConfigUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin: policies currently in force for a region' })
  list(@Query() query: ListPolicyConfigsQueryDto): Promise<ListPolicyConfigsResult> {
    return this.listPolicyConfigs.execute(query.regionCode);
  }

  @Put(':policyType')
  @ApiParam({ name: 'policyType', enum: PolicyType })
  @ApiOperation({ summary: 'Admin: set a policy value for a region — takes effect immediately, audited' })
  upsert(
    @Param('policyType') policyType: string,
    @Body() dto: UpsertPolicyConfigDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<PolicyConfigSummary> {
    return this.upsertPolicyConfig.execute(
      { policyType: parsePolicyType(policyType), regionCode: dto.regionCode, value: dto.value },
      user,
    );
  }
}
