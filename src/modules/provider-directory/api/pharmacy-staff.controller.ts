import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CreatePharmacyStaffUseCase } from '../application/create-pharmacy-staff.use-case';
import { DeletePharmacyStaffUseCase } from '../application/delete-pharmacy-staff.use-case';
import { GetPharmacyStaffUseCase } from '../application/get-pharmacy-staff.use-case';
import { UpdatePharmacyStaffUseCase } from '../application/update-pharmacy-staff.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { PharmacyStaffResponse, ProvisionedPharmacyStaffResponse } from '../domain/pharmacy-staff-response.util';
import { CreatePharmacyStaffDto } from './dto/create-pharmacy-staff.dto';
import { UpdatePharmacyStaffDto } from './dto/update-pharmacy-staff.dto';

/**
 * Pharmacy staff provisioning: unlike a doctor's assistants (self-service,
 * `@Roles(DOCTOR)`), a pharmacy's single staff account is provisioned by the
 * Admin who onboards the pharmacy itself — so `@Roles(ADMIN)` at the class
 * level covers every endpoint. Kept on its own controller rather than bolted
 * onto `PharmaciesController`, which is `@OptionalAuth()`-mixed for public
 * pharmacy detail. No `/admin` URL prefix (File 12 Part 32.4/07.3):
 * authorization lives on the route, not the path.
 */
@ApiTags('pharmacy-staff')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('pharmacies/:pharmacyId/staff')
export class PharmacyStaffController {
  constructor(
    @Inject(GetPharmacyStaffUseCase) private readonly getPharmacyStaff: GetPharmacyStaffUseCase,
    @Inject(CreatePharmacyStaffUseCase) private readonly createPharmacyStaff: CreatePharmacyStaffUseCase,
    @Inject(UpdatePharmacyStaffUseCase) private readonly updatePharmacyStaff: UpdatePharmacyStaffUseCase,
    @Inject(DeletePharmacyStaffUseCase) private readonly deletePharmacyStaff: DeletePharmacyStaffUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Admin: the pharmacy's single staff account, or null if none is provisioned" })
  get(@Param('pharmacyId', ParseUUIDPipe) pharmacyId: string): Promise<PharmacyStaffResponse | null> {
    return this.getPharmacyStaff.execute(pharmacyId);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Admin: provision the pharmacy staff account — returns the one-time generated password' })
  create(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Body() dto: CreatePharmacyStaffDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ProvisionedPharmacyStaffResponse> {
    return this.createPharmacyStaff.execute(pharmacyId, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin: update the pharmacy staff account — display name and/or ACTIVE/SUSPENDED status' })
  update(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePharmacyStaffDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<PharmacyStaffResponse> {
    return this.updatePharmacyStaff.execute(pharmacyId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: deactivate the pharmacy staff account — revokes the role membership, deletes no row' })
  async remove(
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.deletePharmacyStaff.execute(pharmacyId, id, user);
  }
}
