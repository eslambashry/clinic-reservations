import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType, ScheduleTemplate } from '@prisma/client';
import { CreateScheduleTemplateUseCase } from '../application/create-schedule-template.use-case';
import { DeleteScheduleTemplateUseCase } from '../application/delete-schedule-template.use-case';
import { ListScheduleTemplatesUseCase } from '../application/list-schedule-templates.use-case';
import { UpdateScheduleTemplateUseCase } from '../application/update-schedule-template.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { ListScheduleTemplatesQueryDto } from './dto/list-schedule-templates-query.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';

/**
 * File 12 Part 33.1/33.2: Admin-only CRUD for `schedule_templates` — no
 * endpoint is documented in File 11 05.x, decided the same way Phase 2
 * decided provider CRUD (full Admin surface, no `/admin` prefix).
 */
@ApiTags('schedule-templates')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('schedule-templates')
export class ScheduleTemplatesController {
  constructor(
    @Inject(CreateScheduleTemplateUseCase) private readonly createScheduleTemplate: CreateScheduleTemplateUseCase,
    @Inject(UpdateScheduleTemplateUseCase) private readonly updateScheduleTemplate: UpdateScheduleTemplateUseCase,
    @Inject(DeleteScheduleTemplateUseCase) private readonly deleteScheduleTemplate: DeleteScheduleTemplateUseCase,
    @Inject(ListScheduleTemplatesUseCase) private readonly listScheduleTemplates: ListScheduleTemplatesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Admin: create a weekday+time-range availability template for an affiliation' })
  create(@Body() dto: CreateScheduleTemplateDto, @CurrentUser() user: AccessTokenPayload): Promise<ScheduleTemplate> {
    return this.createScheduleTemplate.execute(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Admin: list schedule templates for an affiliation' })
  list(@Query() query: ListScheduleTemplatesQueryDto): Promise<ScheduleTemplate[]> {
    return this.listScheduleTemplates.execute(query.affiliationId);
  }

  @Patch(':scheduleTemplateId')
  @ApiOperation({ summary: 'Admin: update a schedule template (not retroactive to already-generated slots, Part 33.8)' })
  async update(
    @Param('scheduleTemplateId', ParseUUIDPipe) scheduleTemplateId: string,
    @Body() dto: UpdateScheduleTemplateDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateScheduleTemplate.execute(scheduleTemplateId, dto, user);
  }

  @Delete(':scheduleTemplateId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: delete a schedule template (stops future generation only, Part 33.8)' })
  async remove(
    @Param('scheduleTemplateId', ParseUUIDPipe) scheduleTemplateId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.deleteScheduleTemplate.execute(scheduleTemplateId, user);
  }
}
