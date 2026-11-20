import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateDoctorRequestUseCase } from '../application/create-doctor-request.use-case';
import { AdminDoctorRequest, MyDoctorRequest } from '../application/doctor-request.mapper';
import {
  AdminDoctorRequestsResult,
  GetAdminDoctorRequestUseCase,
  ListAdminDoctorRequestsUseCase,
  ListMyDoctorRequestsUseCase,
} from '../application/doctor-request-queries.use-cases';
import { UpdateDoctorRequestStatusUseCase } from '../application/update-doctor-request-status.use-case';
import { AdminListDoctorRequestsQueryDto, UpdateDoctorRequestStatusDto } from './dto/admin-doctor-request.dto';
import { CreateDoctorRequestDto } from './dto/create-doctor-request.dto';

/** Patient "add a doctor" requests. Patients create/list their own; Admin lists and moves them along. */
@ApiTags('doctor-requests')
@Controller('doctor-requests')
export class DoctorRequestsController {
  constructor(
    @Inject(CreateDoctorRequestUseCase) private readonly createRequest: CreateDoctorRequestUseCase,
    @Inject(ListMyDoctorRequestsUseCase) private readonly listMine: ListMyDoctorRequestsUseCase,
    @Inject(ListAdminDoctorRequestsUseCase) private readonly listAdmin: ListAdminDoctorRequestsUseCase,
    @Inject(GetAdminDoctorRequestUseCase) private readonly getAdmin: GetAdminDoctorRequestUseCase,
    @Inject(UpdateDoctorRequestStatusUseCase) private readonly updateStatus: UpdateDoctorRequestStatusUseCase,
  ) {}

  @ApiBearerAuth()
  @Roles(RoleContextType.PATIENT)
  @Post()
  @ApiOperation({ summary: 'Patient asks for a doctor that is not on the platform (all fields optional, at least one required)' })
  create(@Body() dto: CreateDoctorRequestDto, @CurrentUser() user: AccessTokenPayload): Promise<MyDoctorRequest> {
    return this.createRequest.execute(dto, user);
  }

  // Registered before `:id` so the literal 'mine' never reaches a ParseUUIDPipe.
  @ApiBearerAuth()
  @Roles(RoleContextType.PATIENT)
  @Get('mine')
  @ApiOperation({ summary: "The caller's doctor requests with their current status, newest first" })
  mine(@CurrentUser() user: AccessTokenPayload): Promise<{ items: MyDoctorRequest[] }> {
    return this.listMine.execute(user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Admin: all doctor requests, filter by status, offset-paginated' })
  list(@Query() query: AdminListDoctorRequestsQueryDto): Promise<AdminDoctorRequestsResult> {
    return this.listAdmin.execute(query);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Admin: one doctor request with the requesting patient' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminDoctorRequest> {
    return this.getAdmin.execute(id);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin: change the status (optionally with a note); the patient is notified' })
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorRequestStatusDto,
  ): Promise<{ id: string; status: string }> {
    return this.updateStatus.execute(id, dto.status, dto.adminNote);
  }
}
