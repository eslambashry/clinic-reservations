import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Pharmacy, PharmacyBranch, RoleContextType } from '@prisma/client';
import { CreatePharmacyBranchUseCase } from '../application/create-pharmacy-branch.use-case';
import { CreatePharmacyUseCase } from '../application/create-pharmacy.use-case';
import { GetPharmacyUseCase } from '../application/get-pharmacy.use-case';
import { SuspendPharmacyUseCase } from '../application/suspend-pharmacy.use-case';
import { UpdatePharmacyUseCase } from '../application/update-pharmacy.use-case';
import { VerifyPharmacyUseCase } from '../application/verify-pharmacy.use-case';
import { PharmacyWithBranches } from '../infrastructure/pharmacy.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreatePharmacyBranchDto } from './dto/create-pharmacy-branch.dto';
import { CreatePharmacyDto } from './dto/create-pharmacy.dto';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';

@ApiTags('pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(
    @Inject(CreatePharmacyUseCase) private readonly createPharmacy: CreatePharmacyUseCase,
    @Inject(UpdatePharmacyUseCase) private readonly updatePharmacy: UpdatePharmacyUseCase,
    @Inject(VerifyPharmacyUseCase) private readonly verifyPharmacy: VerifyPharmacyUseCase,
    @Inject(SuspendPharmacyUseCase) private readonly suspendPharmacy: SuspendPharmacyUseCase,
    @Inject(GetPharmacyUseCase) private readonly getPharmacy: GetPharmacyUseCase,
    @Inject(CreatePharmacyBranchUseCase) private readonly createBranch: CreatePharmacyBranchUseCase,
  ) {}

  @OptionalAuth()
  @Get(':pharmacyId')
  @ApiOperation({ summary: 'Public pharmacy detail — VERIFIED-only unless caller is Admin' })
  get(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<PharmacyWithBranches> {
    return this.getPharmacy.execute(pharmacyId, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Admin: onboard a pharmacy (status starts PENDING)' })
  create(@Body() dto: CreatePharmacyDto, @CurrentUser() user: AccessTokenPayload): Promise<Pharmacy> {
    return this.createPharmacy.execute(dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':pharmacyId')
  @ApiOperation({ summary: 'Admin: update pharmacy fields' })
  async update(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Body() dto: UpdatePharmacyDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updatePharmacy.execute(pharmacyId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':pharmacyId/verify')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: manual verification — emits ProviderVerified' })
  async verify(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.verifyPharmacy.execute(pharmacyId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':pharmacyId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: suspend' })
  async suspend(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.suspendPharmacy.execute(pharmacyId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':pharmacyId/branches')
  @ApiOperation({ summary: 'Admin: add a physical branch to a pharmacy (status starts PENDING)' })
  createPharmacyBranch(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Body() dto: CreatePharmacyBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<PharmacyBranch> {
    return this.createBranch.execute(pharmacyId, dto, user);
  }
}
