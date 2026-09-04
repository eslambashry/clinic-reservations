import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CreateMyClinicBranchUseCase } from '../application/create-my-clinic-branch.use-case';
import { DeleteMyClinicBranchUseCase } from '../application/delete-my-clinic-branch.use-case';
import { ListMyDoctorClinicsResult, ListMyDoctorClinicsUseCase, MyDoctorClinic } from '../application/list-my-doctor-clinics.use-case';
import { UpdateMyAffiliationUseCase } from '../application/update-my-affiliation.use-case';
import { UpdateMyClinicBranchUseCase } from '../application/update-my-clinic-branch.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { UpdateMyAffiliationDto } from './dto/update-my-affiliation.dto';
import { UpdateMyClinicBranchDto } from './dto/update-my-clinic-branch.dto';
import { CreateMyClinicBranchDto } from './dto/create-my-clinic-branch.dto';

/**
 * Doctor Dashboard — clinics and branches (File 12 Part 49.2-49.4).
 *
 * Mounted under `doctors/me/...` rather than a `/v1/provider/*` prefix, to
 * match the convention the rest of this codebase already uses for
 * "server resolves the caller's own scope" reads (`GET /v1/doctors/me`,
 * `GET /v1/pharmacy-orders` for PHARMACY_STAFF). No `doctorId`,
 * `clinicId` or `affiliationId` is ever accepted as a *scoping* input —
 * path params here name a resource whose ownership is then re-checked
 * against the JWT-derived scope inside the use-case, never trusted.
 *
 * `@Roles(DOCTOR)` at class level blocks CLINIC_STAFF and Admin from reaching
 * this doctor-owned management surface; Admin retains the separate legal and
 * verification endpoints under `/clinic-branches`.
 */
@ApiTags('doctor-clinics')
@ApiBearerAuth()
@Roles(RoleContextType.DOCTOR)
@Controller('doctors/me/clinics')
export class DoctorClinicsController {
  constructor(
    @Inject(ListMyDoctorClinicsUseCase) private readonly listMyClinics: ListMyDoctorClinicsUseCase,
    @Inject(UpdateMyClinicBranchUseCase) private readonly updateMyBranch: UpdateMyClinicBranchUseCase,
    @Inject(UpdateMyAffiliationUseCase) private readonly updateMyAffiliation: UpdateMyAffiliationUseCase,
    @Inject(CreateMyClinicBranchUseCase) private readonly createMyBranch: CreateMyClinicBranchUseCase,
    @Inject(DeleteMyClinicBranchUseCase) private readonly deleteMyBranch: DeleteMyClinicBranchUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "The calling doctor's clinics and branches — legal clinic data (legal name, tax id) deliberately omitted" })
  list(@CurrentUser() user: AccessTokenPayload): Promise<ListMyDoctorClinicsResult> {
    return this.listMyClinics.execute(user);
  }

  @Post(':clinicId/branches')
  createBranch(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreateMyClinicBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<MyDoctorClinic> {
    return this.createMyBranch.execute({ ...dto, clinicId, currency: dto.currency ?? 'EGP' }, user);
  }

  @Patch('branches/:branchId')
  @Roles(RoleContextType.DOCTOR)
  @ApiOperation({ summary: 'Update operational branch data (phone, timezone, street/city) for a branch the caller is affiliated with' })
  updateBranch(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateMyClinicBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<MyDoctorClinic> {
    return this.updateMyBranch.execute(branchId, dto, user);
  }

  @Patch('affiliations/:affiliationId')
  @Roles(RoleContextType.DOCTOR)
  @ApiOperation({ summary: "Pause or reactivate the caller's own affiliation with a branch — no delete exists on this surface" })
  updateAffiliation(
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
    @Body() dto: UpdateMyAffiliationDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<MyDoctorClinic> {
    return this.updateMyAffiliation.execute(affiliationId, dto, user);
  }

  @Delete('branches/:branchId')
  @HttpCode(204)
  async deleteBranch(@Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.deleteMyBranch.execute(branchId, user);
  }
}
