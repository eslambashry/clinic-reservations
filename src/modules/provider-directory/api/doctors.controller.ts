import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Doctor, DoctorClinicAffiliation, RoleContextType } from '@prisma/client';
import { CreateAffiliationUseCase } from '../application/create-affiliation.use-case';
import { CreateDoctorUseCase } from '../application/create-doctor.use-case';
import { DoctorDetail, GetDoctorUseCase } from '../application/get-doctor.use-case';
import { SearchDoctorsResult, SearchDoctorsUseCase } from '../application/search-doctors.use-case';
import { SuspendDoctorUseCase } from '../application/suspend-doctor.use-case';
import { UpdateDoctorUseCase } from '../application/update-doctor.use-case';
import { VerifyDoctorUseCase } from '../application/verify-doctor.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { OptionalAuth } from '../../../shared/core/auth/optional-auth.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateAffiliationDto } from './dto/create-affiliation.dto';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { DoctorSearchQueryDto } from './dto/doctor-search-query.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

/**
 * File 11 05.4/05.3, File 12 Part 32: search + detail are public
 * (`@OptionalAuth()` — an Admin token unlocks full detail on a `PENDING`
 * doctor for review, Part 32.9); create/update/verify/suspend are
 * Admin-only (Part 32.4/07.3), no `/admin` URL prefix.
 */
@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(
    @Inject(CreateDoctorUseCase) private readonly createDoctor: CreateDoctorUseCase,
    @Inject(UpdateDoctorUseCase) private readonly updateDoctor: UpdateDoctorUseCase,
    @Inject(VerifyDoctorUseCase) private readonly verifyDoctor: VerifyDoctorUseCase,
    @Inject(SuspendDoctorUseCase) private readonly suspendDoctor: SuspendDoctorUseCase,
    @Inject(GetDoctorUseCase) private readonly getDoctor: GetDoctorUseCase,
    @Inject(SearchDoctorsUseCase) private readonly searchDoctors: SearchDoctorsUseCase,
    @Inject(CreateAffiliationUseCase) private readonly createAffiliation: CreateAffiliationUseCase,
  ) {}

  @OptionalAuth()
  @Get('search')
  @ApiOperation({ summary: 'Public doctor search (File 10 §2.3) — specialty/location/sort, cursor-paginated' })
  search(@Query() query: DoctorSearchQueryDto): Promise<SearchDoctorsResult> {
    return this.searchDoctors.execute(query);
  }

  @OptionalAuth()
  @Get(':doctorId')
  @ApiOperation({ summary: 'Public doctor profile — VERIFIED-only unless caller is Admin' })
  get(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @CurrentUser() user: AccessTokenPayload | undefined,
  ): Promise<DoctorDetail> {
    return this.getDoctor.execute(doctorId, user?.contextType);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Admin: onboard a doctor directory record (status starts PENDING)' })
  create(@Body() dto: CreateDoctorDto, @CurrentUser() user: AccessTokenPayload): Promise<Doctor> {
    return this.createDoctor.execute(dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':doctorId')
  @ApiOperation({ summary: 'Admin: update doctor directory fields' })
  async update(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateDoctor.execute(doctorId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':doctorId/verify')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: manual verification (File 11 07.3) — emits ProviderVerified' })
  async verify(@Param('doctorId', ParseUUIDPipe) doctorId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.verifyDoctor.execute(doctorId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':doctorId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: suspend — doctor becomes invisible again' })
  async suspend(@Param('doctorId', ParseUUIDPipe) doctorId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.suspendDoctor.execute(doctorId, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post(':doctorId/affiliations')
  @ApiOperation({ summary: 'Admin: affiliate a doctor with a clinic branch' })
  createDoctorAffiliation(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Body() dto: CreateAffiliationDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<DoctorClinicAffiliation> {
    return this.createAffiliation.execute(doctorId, dto, user);
  }
}
