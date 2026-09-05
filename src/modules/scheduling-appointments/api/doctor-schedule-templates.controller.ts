import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { MyScheduleTemplate } from '../application/doctor-schedule-template.mapper';
import { ListMyScheduleTemplatesResult, ListMyScheduleTemplatesUseCase } from '../application/list-my-schedule-templates.use-case';
import { ManageMyScheduleTemplatesUseCase } from '../application/manage-my-schedule-templates.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateMyScheduleTemplateDto } from './dto/create-my-schedule-template.dto';
import { DeleteMyScheduleTemplateQueryDto } from './dto/delete-my-schedule-template-query.dto';
import { ListMyScheduleTemplatesQueryDto } from './dto/list-my-schedule-templates-query.dto';
import { UpdateMyScheduleTemplateDto } from './dto/update-my-schedule-template.dto';

/**
 * Doctor Dashboard — availability (File 12 Part 49.5/49.6).
 *
 * Part 33.1 originally made schedule-template CRUD Admin-only *because*
 * "provider self-service requires the Provider Web Dashboard + a
 * `role_membership` for DOCTOR" — both of which now exist. This controller
 * un-defers exactly that, without touching the Admin routes
 * (`/v1/schedule-templates`, still `@Roles(ADMIN)`): the two surfaces share
 * one set of use-cases and differ only in how ownership is resolved.
 *
 * Times are `"HH:mm"` local to the owning branch's `ianaTimezone`, which is
 * echoed on every row here so the dashboard never has to guess (Part 33.6).
 * Edits are **not** retroactive — already-generated `appointment_slots`,
 * including held/booked ones, are never touched (Part 33.8 / File 11 05.3).
 */
@ApiTags('doctor-schedule-templates')
@ApiBearerAuth()
@Controller('doctors/me/schedule-templates')
export class DoctorScheduleTemplatesController {
  constructor(
    @Inject(ListMyScheduleTemplatesUseCase) private readonly listMyTemplates: ListMyScheduleTemplatesUseCase,
    @Inject(ManageMyScheduleTemplatesUseCase) private readonly manageMyTemplates: ManageMyScheduleTemplatesUseCase,
  ) {}

  // CLINIC_STAFF (the clinic assistant) can view the templates the doctor's
  // own home/schedule screen is built from — same read-only precedent
  // `doctor-appointments.controller.ts` already sets for that role — but
  // create/update/delete stay DOCTOR-only below; an assistant has no
  // business editing the doctor's own availability.
  @Roles(RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF)
  @Get()
  @ApiOperation({ summary: "The calling doctor's own weekly availability templates across every affiliation they own (or, for CLINIC_STAFF, the doctor they're provisioned under)" })
  list(@Query() query: ListMyScheduleTemplatesQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListMyScheduleTemplatesResult> {
    return this.listMyTemplates.execute(query, user);
  }

  @Roles(RoleContextType.DOCTOR)
  @Post()
  @ApiOperation({ summary: 'Create a weekday availability window on one of the caller’s own affiliations' })
  create(@Body() dto: CreateMyScheduleTemplateDto, @CurrentUser() user: AccessTokenPayload): Promise<MyScheduleTemplate> {
    return this.manageMyTemplates.create(dto, user);
  }

  @Roles(RoleContextType.DOCTOR)
  @Patch(':scheduleTemplateId')
  @ApiOperation({ summary: 'Update one of the caller’s own templates — affects future slot generation only, never existing slots' })
  update(
    @Param('scheduleTemplateId', ParseUUIDPipe) scheduleTemplateId: string,
    @Body() dto: UpdateMyScheduleTemplateDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<MyScheduleTemplate> {
    return this.manageMyTemplates.update(scheduleTemplateId, dto, user);
  }

  @Roles(RoleContextType.DOCTOR)
  @Delete(':scheduleTemplateId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop future generation from this template — already-generated slots and their appointments are untouched' })
  async remove(
    @Param('scheduleTemplateId', ParseUUIDPipe) scheduleTemplateId: string,
    @Query() query: DeleteMyScheduleTemplateQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.manageMyTemplates.remove(scheduleTemplateId, query.version, user);
  }
}
