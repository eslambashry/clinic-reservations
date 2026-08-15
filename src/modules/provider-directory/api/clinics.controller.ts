import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Clinic, ClinicBranch, RoleContextType } from '@prisma/client';
import { CreateClinicBranchUseCase } from '../application/create-clinic-branch.use-case';
import { CreateClinicUseCase } from '../application/create-clinic.use-case';
import { GetClinicUseCase } from '../application/get-clinic.use-case';
import { SuspendClinicUseCase } from '../application/suspend-clinic.use-case';
import { UpdateClinicUseCase } from '../application/update-clinic.use-case';
import { VerifyClinicUseCase } from '../application/verify-clinic.use-case';
import { ClinicWithBranches } from '../infrastructure/clinic.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateClinicBranchDto } from './dto/create-clinic-branch.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@ApiTags('clinics')
@Controller('clinics')
export class ClinicsController {
  constructor(
    @Inject(CreateClinicUseCase) private readonly createClinic: CreateClinicUseCase,
    @Inject(UpdateClinicUseCase) private readonly updateClinic: UpdateClinicUseCase,
    @Inject(VerifyClinicUseCase) private readonly verifyClinic: VerifyClinicUseCase,
    @Inject(SuspendClinicUseCase) private readonly suspendClinic: SuspendClinicUseCase,
    @Inject(GetClinicUseCase) private readonly getClinic: GetClinicUseCase,
    @Inject(CreateClinicBranchUseCase) private readonly createBranch: CreateClinicBranchUseCase,
  ) {}

  @OptionalAuth()
  @Get(':clinicId')
  @ApiOperation({ summary: 'Public clinic detail — VERIFIED-only unless caller is Admin' })
  get(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<ClinicWithBranches> {
    return this.getClinic.execute(clinicId, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Admin: onboard a clinic (status starts PENDING)' })
  create(@Body() dto: CreateClinicDto, @CurrentUser() user: AccessTokenPayload): Promise<Clinic> {
    return this.createClinic.execute(dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':clinicId')
  @ApiOperation({ summary: 'Admin: update clinic fields' })
  async update(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: UpdateClinicDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateClinic.execute(clinicId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':clinicId/verify')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: manual verification — emits ProviderVerified' })
  async verify(@Param('clinicId', ParseUUIDPipe) clinicId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.verifyClinic.execute(clinicId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':clinicId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: suspend' })
  async suspend(@Param('clinicId', ParseUUIDPipe) clinicId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.suspendClinic.execute(clinicId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':clinicId/branches')
  @ApiOperation({ summary: 'Admin: add a physical branch to a clinic (status starts PENDING)' })
  createClinicBranch(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreateClinicBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ClinicBranch> {
    return this.createBranch.execute(clinicId, dto, user);
  }
}
