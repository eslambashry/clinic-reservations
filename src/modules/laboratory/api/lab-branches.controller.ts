import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { GetLabBranchUseCase, LabBranchDetail } from '../application/get-lab-branch.use-case';
import { SearchLabBranchesResult, SearchLabBranchesUseCase } from '../application/search-lab-branches.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { LabBranchSearchQueryDto } from './dto/lab-branch-search-query.dto';

/**
 * Sibling resource to `lab-orders`/`lab-audit`, not nested. Two different
 * audiences: `search` is public (patient-facing directory browse, added
 * later than the rest of this controller — see `SearchLabBranchesUseCase`),
 * `:branchId` stays `LAB_STAFF`-only, self-branch-only (File 12 Part 48,
 * backs the real-auth bridge's post-login branch display, mirroring
 * `medsuper-pharmacy-dashboard`'s own `GET /pharmacy-branches/{id}` call in
 * its `HttpAuthService.fetchSession`). `search` is declared first — Nest
 * matches routes in declaration order, and `:branchId` would otherwise
 * swallow the literal `/lab-branches/search` path.
 */
@ApiTags('lab-branches')
@Controller('lab-branches')
export class LabBranchesController {
  constructor(
    @Inject(GetLabBranchUseCase) private readonly getLabBranch: GetLabBranchUseCase,
    @Inject(SearchLabBranchesUseCase) private readonly searchLabBranches: SearchLabBranchesUseCase,
  ) {}

  @OptionalAuth()
  @Get('search')
  @ApiOperation({ summary: 'Public lab branch search — text/location/home-collection filter, cursor-paginated' })
  search(@Query() query: LabBranchSearchQueryDto): Promise<SearchLabBranchesResult> {
    return this.searchLabBranches.execute(query);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.LAB_STAFF)
  @Get(':branchId')
  @ApiOperation({ summary: "Branch display info — LAB_STAFF, caller's own branch only" })
  get(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AccessTokenPayload): Promise<LabBranchDetail> {
    return this.getLabBranch.execute(branchId, user);
  }
}
