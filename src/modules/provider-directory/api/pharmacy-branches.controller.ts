import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { GetPharmacyBranchUseCase } from '../application/get-pharmacy-branch.use-case';
import { SearchPharmacyBranchesResult, SearchPharmacyBranchesUseCase } from '../application/search-pharmacy-branches.use-case';
import { UpdatePharmacyBranchUseCase } from '../application/update-pharmacy-branch.use-case';
import { PharmacyBranchWithRelations } from '../infrastructure/pharmacy-branch.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { PharmacyBranchSearchQueryDto } from './dto/pharmacy-branch-search-query.dto';
import { UpdatePharmacyBranchDto } from './dto/update-pharmacy-branch.dto';

@ApiTags('pharmacy-branches')
@Controller('pharmacy-branches')
export class PharmacyBranchesController {
  constructor(
    @Inject(UpdatePharmacyBranchUseCase) private readonly updateBranch: UpdatePharmacyBranchUseCase,
    @Inject(GetPharmacyBranchUseCase) private readonly getBranch: GetPharmacyBranchUseCase,
    @Inject(SearchPharmacyBranchesUseCase) private readonly searchBranches: SearchPharmacyBranchesUseCase,
  ) {}

  @OptionalAuth()
  @Get('search')
  @ApiOperation({ summary: 'Public pharmacy branch search (File 12 Part 37) — text/location/delivery filter, cursor-paginated' })
  search(@Query() query: PharmacyBranchSearchQueryDto): Promise<SearchPharmacyBranchesResult> {
    return this.searchBranches.execute(query);
  }

  @OptionalAuth()
  @Get(':branchId')
  @ApiOperation({ summary: 'Public pharmacy branch detail — VERIFIED-only unless caller is Admin' })
  get(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<PharmacyBranchWithRelations> {
    return this.getBranch.execute(branchId, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':branchId')
  @ApiOperation({ summary: 'Admin: update branch fields (phone/timezone/delivery/address)' })
  async update(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdatePharmacyBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateBranch.execute(branchId, dto, user);
  }

}
