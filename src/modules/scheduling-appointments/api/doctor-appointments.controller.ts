import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CancelAppointmentResult, CancelAppointmentUseCase } from '../application/cancel-appointment.use-case';
import { DoctorAppointmentSummary } from '../application/doctor-appointment.mapper';
import { GetDoctorAppointmentUseCase } from '../application/get-doctor-appointment.use-case';
import { ListDoctorAppointmentsResult, ListDoctorAppointmentsUseCase } from '../application/list-doctor-appointments.use-case';
import { RescheduleAppointmentResult, RescheduleAppointmentUseCase } from '../application/reschedule-appointment.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CancelDoctorAppointmentDto } from './dto/cancel-doctor-appointment.dto';
import { CreateClinicStaffAppointmentDto } from './dto/create-clinic-staff-appointment.dto';
import { ListDoctorAppointmentsQueryDto } from './dto/list-doctor-appointments-query.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CreateClinicStaffAppointmentResult, CreateClinicStaffAppointmentUseCase } from '../application/create-clinic-staff-appointment.use-case';

/**
 * Doctor Dashboard — appointments (File 12 Part 49.7-49.9). The provider
 * half of File 11 05.5's "the owning patient, or clinic staff of the
 * associated branch, or the doctor" auth line, deferred by Part 35.8/35.14.
 *
 * Mounted alongside the patient routes rather than replacing them:
 * `/v1/appointments/*` stays `@Roles(PATIENT)` and completely untouched, so
 * no existing patient behaviour changes. The two surfaces share the same
 * use-cases; only the ownership resolution differs.
 *
 * `cancel`/`reschedule` are `Idempotency-Key`-guarded exactly like their
 * patient counterparts (File 11 Part 11) — a double-tapped cancel button
 * must not double-refund.
 *
 * There is no `DELETE` here, at any level: an appointment is never removed,
 * only transitioned (`CANCELLED`/`RESCHEDULED`).
 */
@ApiTags('doctor-appointments')
@ApiBearerAuth()
@Roles(RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF)
@Controller('doctors/me/appointments')
export class DoctorAppointmentsController {
  constructor(
    @Inject(ListDoctorAppointmentsUseCase) private readonly listDoctorAppointments: ListDoctorAppointmentsUseCase,
    @Inject(GetDoctorAppointmentUseCase) private readonly getDoctorAppointment: GetDoctorAppointmentUseCase,
    @Inject(CancelAppointmentUseCase) private readonly cancelAppointment: CancelAppointmentUseCase,
    @Inject(RescheduleAppointmentUseCase) private readonly rescheduleAppointment: RescheduleAppointmentUseCase,
    @Inject(CreateClinicStaffAppointmentUseCase) private readonly createClinicStaffAppointment: CreateClinicStaffAppointmentUseCase,
  ) {}

  @Post('branch/:clinicBranchId/create')
  @Roles(RoleContextType.CLINIC_STAFF)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Clinic staff books a patient into an open slot in their own branch' })
  create(
    @Param('clinicBranchId', ParseUUIDPipe) clinicBranchId: string,
    @Body() dto: CreateClinicStaffAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CreateClinicStaffAppointmentResult> {
    return this.createClinicStaffAppointment.execute({ ...dto, clinicBranchId }, user);
  }

  @Get()
  @ApiOperation({ summary: "The calling doctor's own appointment queue — filter by date range, status and branch; cursor-paginated" })
  list(
    @Query() query: ListDoctorAppointmentsQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ListDoctorAppointmentsResult> {
    return this.listDoctorAppointments.execute(query, user);
  }

  @Get(':appointmentId')
  @ApiOperation({ summary: 'Appointment detail, including patient contact — 404 for any appointment outside the caller’s affiliations' })
  get(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<DoctorAppointmentSummary> {
    return this.getDoctorAppointment.execute(appointmentId, user);
  }

  @Post(':appointmentId/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Provider-initiated cancellation — releases the slot, refunds in full (no fee), audits and emits AppointmentCancelled' })
  cancel(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: CancelDoctorAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CancelAppointmentResult> {
    return this.cancelAppointment.execute(appointmentId, dto, user);
  }

  @Post(':appointmentId/reschedule')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'Provider-initiated reschedule onto another slot of the SAME affiliation — completes in one transaction and returns the new CONFIRMED appointment (Part 49.9)',
  })
  reschedule(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RescheduleAppointmentResult> {
    return this.rescheduleAppointment.execute(appointmentId, dto, user);
  }
}
