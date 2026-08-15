import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CancelAppointmentResult, CancelAppointmentUseCase } from '../application/cancel-appointment.use-case';
import { ConfirmAppointmentResult, ConfirmAppointmentUseCase } from '../application/confirm-appointment.use-case';
import { CreateHoldResult, CreateHoldUseCase } from '../application/create-hold.use-case';
import { AppointmentSummary, GetAppointmentUseCase } from '../application/get-appointment.use-case';
import { ListAppointmentsResult, ListAppointmentsUseCase } from '../application/list-appointments.use-case';
import { RescheduleAppointmentResult, RescheduleAppointmentUseCase } from '../application/reschedule-appointment.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { ConfirmAppointmentDto } from './dto/confirm-appointment.dto';
import { CreateHoldDto } from './dto/create-hold.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

/**
 * File 10 §2.3 / File 12 Part 35: the PATIENT-facing booking loop
 * (hold → confirm). `Idempotency-Key` is required on both routes per File
 * 11 Part 11's concurrency table — enforced by `IdempotencyInterceptor`,
 * which is a no-op when the header is absent, so validation of its
 * presence, if ever made mandatory at the framework level, is a separate
 * decision from this controller.
 */
@ApiTags('appointments')
@ApiBearerAuth()
@Roles(RoleContextType.PATIENT)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly createHold: CreateHoldUseCase,
    private readonly confirmAppointment: ConfirmAppointmentUseCase,
    private readonly cancelAppointment: CancelAppointmentUseCase,
    private readonly rescheduleAppointment: RescheduleAppointmentUseCase,
    private readonly listAppointments: ListAppointmentsUseCase,
    private readonly getAppointment: GetAppointmentUseCase,
  ) {}

  @Post('hold')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Hold an OPEN slot for 5 minutes (File 10 §2.3 / File 12 Part 35)' })
  hold(@Body() dto: CreateHoldDto, @CurrentUser() user: AccessTokenPayload): Promise<CreateHoldResult> {
    return this.createHold.execute(dto, user);
  }

  @Post(':holdId/confirm')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Confirm a hold into a CONFIRMED appointment — pay-at-clinic only for now (Part 35.4)' })
  confirm(
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @Body() dto: ConfirmAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ConfirmAppointmentResult> {
    return this.confirmAppointment.execute(holdId, dto, user);
  }

  @Post(':appointmentId/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Cancel a confirmed appointment (patient-only in this increment, Part 35.8)' })
  cancel(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CancelAppointmentResult> {
    return this.cancelAppointment.execute(appointmentId, dto, user);
  }

  @Post(':appointmentId/reschedule')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Release the old slot, hold a new one (Part 35.10) — still requires a separate /confirm call' })
  reschedule(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RescheduleAppointmentResult> {
    return this.rescheduleAppointment.execute(appointmentId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: '"My Appointments" — cursor-paginated, always scoped to the caller (Part 35.14/35.15)' })
  list(@Query() query: ListAppointmentsQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListAppointmentsResult> {
    return this.listAppointments.execute(query, user);
  }

  @Get(':appointmentId')
  @ApiOperation({ summary: 'Appointment detail — patient-only in this increment (Part 35.14)' })
  get(@Param('appointmentId', ParseUUIDPipe) appointmentId: string, @CurrentUser() user: AccessTokenPayload): Promise<AppointmentSummary> {
    return this.getAppointment.execute(appointmentId, user);
  }
}
