import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { GetLabBranchUseCase, LabBranchDetail } from '../application/get-lab-branch.use-case';
import { SearchLabBranchesResult, SearchLabBranchesUseCase } from '../application/search-lab-branches.use-case';
import { UpdateLabBranchUseCase } from '../application/update-lab-branch.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { LabBranchSearchQueryDto } from './dto/lab-branch-search-query.dto';
import { UpdateLabBranchDto } from './dto/update-lab-branch.dto';

/**
 * Sibling resource to `lab-orders`/`lab-audit`, not nested. Three different
 * audiences, so the role decorator is per-route rather than class-level:
 * `search` is public (patient-facing directory browse), `GET :branchId`
 * stays `LAB_STAFF`-only and self-branch-only (File 12 Part 48, backs the
 * real-auth bridge's post-login branch display), and the directory
 * mutations mirror `PharmacyBranchesController`'s Admin surface.
 *
 * `RbacGuard` matches context exactly — ADMIN is not a superuser — so an
 * Admin token could never reach the `LAB_STAFF` detail route, and each
 * admin route below carries its own `@Roles(ADMIN)`. Creating a branch is
 * not here but on `POST /laboratories/:laboratoryId/branches`, the same
 * nesting pharmacy uses: a branch cannot exist without its owner.
 *
 * `search` is declared first — Nest matches routes in declaration order, and
 * `:branchId` would otherwise swallow the literal `/lab-branches/search` path.
 */
@ApiTags('lab-branches')
@Controller('lab-branches')
export class LabBranchesController {
  constructor(
    @Inject(GetLabBranchUseCase) private readonly getLabBranch: GetLabBranchUseCase,
    @Inject(SearchLabBranchesUseCase) private readonly searchLabBranches: SearchLabBranchesUseCase,
    @Inject(UpdateLabBranchUseCase) private readonly updateBranch: UpdateLabBranchUseCase,
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

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':branchId')
  @ApiOperation({ summary: 'Admin: update branch fields (phone/timezone/home-collection/address)' })
  async update(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateLabBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateBranch.execute(branchId, dto, user);
  }
}
