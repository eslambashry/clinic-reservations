import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CreateLabStaffUseCase } from '../application/create-lab-staff.use-case';
import { DeleteLabStaffUseCase } from '../application/delete-lab-staff.use-case';
import { GetLabStaffUseCase } from '../application/get-lab-staff.use-case';
import { UpdateLabStaffUseCase } from '../application/update-lab-staff.use-case';
import { LabStaffResponse, ProvisionedLabStaffResponse } from '../domain/lab-staff-response.util';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { CreateLabStaffDto } from './dto/create-lab-staff.dto';
import { UpdateLabStaffDto } from './dto/update-lab-staff.dto';

/**
 * Exact structural mirror of `provider-directory`'s `PharmacyStaffController`,
 * kept in this module because `lab_branches`/`lab_staff_assignments` are
 * `laboratory`-owned tables (File 12 Part 05). Unlike a clinic assistant
 * (provisioned by the doctor, `@Roles(DOCTOR)`), a laboratory's single staff
 * account is provisioned by the Admin who onboards the laboratory itself —
 * so `@Roles(ADMIN)` at the class level is the whole authorization decision,
 * with no `/admin` URL prefix.
 */
@ApiTags('lab-staff')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('laboratories/:laboratoryId/staff')
export class LabStaffController {
  constructor(
    @Inject(GetLabStaffUseCase) private readonly getLabStaff: GetLabStaffUseCase,
    @Inject(CreateLabStaffUseCase) private readonly createLabStaff: CreateLabStaffUseCase,
    @Inject(UpdateLabStaffUseCase) private readonly updateLabStaff: UpdateLabStaffUseCase,
    @Inject(DeleteLabStaffUseCase) private readonly deleteLabStaff: DeleteLabStaffUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Admin: the laboratory's single staff account, or null if none is provisioned" })
  get(@Param('laboratoryId', ParseUUIDPipe) laboratoryId: string): Promise<LabStaffResponse | null> {
    return this.getLabStaff.execute(laboratoryId);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Admin: provision the laboratory staff account — returns the one-time generated password' })
  create(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @Body() dto: CreateLabStaffDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ProvisionedLabStaffResponse> {
    return this.createLabStaff.execute(laboratoryId, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin: update the laboratory staff account — display name and/or ACTIVE/SUSPENDED status' })
  update(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabStaffDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<LabStaffResponse> {
    return this.updateLabStaff.execute(laboratoryId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: deactivate the laboratory staff account — revokes the role membership, deletes no row' })
  async remove(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.deleteLabStaff.execute(laboratoryId, id, user);
  }
}
