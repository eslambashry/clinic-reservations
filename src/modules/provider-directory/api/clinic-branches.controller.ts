import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { GetClinicBranchUseCase } from '../application/get-clinic-branch.use-case';
import { SuspendClinicBranchUseCase } from '../application/suspend-clinic-branch.use-case';
import { UpdateClinicBranchUseCase } from '../application/update-clinic-branch.use-case';
import { VerifyClinicBranchUseCase } from '../application/verify-clinic-branch.use-case';
import { ClinicBranchWithRelations } from '../infrastructure/clinic-branch.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { UpdateClinicBranchDto } from './dto/update-clinic-branch.dto';

@ApiTags('clinic-branches')
@Controller('clinic-branches')
export class ClinicBranchesController {
  constructor(
    @Inject(UpdateClinicBranchUseCase) private readonly updateBranch: UpdateClinicBranchUseCase,
    @Inject(VerifyClinicBranchUseCase) private readonly verifyBranch: VerifyClinicBranchUseCase,
    @Inject(SuspendClinicBranchUseCase) private readonly suspendBranch: SuspendClinicBranchUseCase,
    @Inject(GetClinicBranchUseCase) private readonly getBranch: GetClinicBranchUseCase,
  ) {}

  @OptionalAuth()
  @Get(':branchId')
  @ApiOperation({ summary: 'Public clinic branch detail — VERIFIED-only unless caller is Admin' })
  get(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<ClinicBranchWithRelations> {
    return this.getBranch.execute(branchId, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':branchId')
  @ApiOperation({ summary: 'Admin: update branch fields (phone/timezone/address)' })
  async update(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateClinicBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateBranch.execute(branchId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':branchId/verify')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: verify branch (Part 32.2 — direct toggle, no document requirement)' })
  async verify(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.verifyBranch.execute(branchId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':branchId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: suspend branch' })
  async suspend(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.suspendBranch.execute(branchId, user);
  }
}
