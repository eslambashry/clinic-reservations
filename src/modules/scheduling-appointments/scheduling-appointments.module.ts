import { Module } from '@nestjs/common';
import { AppointmentsController } from './api/appointments.controller';
import { DoctorScheduleTemplatesController } from './api/doctor-schedule-templates.controller';
import { DoctorSlotsController } from './api/doctor-slots.controller';
import { ScheduleTemplatesController } from './api/schedule-templates.controller';
import { CancelAppointmentUseCase } from './application/cancel-appointment.use-case';
import { ConfirmAppointmentUseCase } from './application/confirm-appointment.use-case';
import { CreateHoldUseCase } from './application/create-hold.use-case';
import { CreateScheduleTemplateUseCase } from './application/create-schedule-template.use-case';
import { DeleteScheduleTemplateUseCase } from './application/delete-schedule-template.use-case';
import { ExpireHoldsUseCase } from './application/expire-holds.use-case';
import { GenerateSlotsUseCase } from './application/generate-slots.use-case';
import { GetAppointmentUseCase } from './application/get-appointment.use-case';
import { GetDoctorSlotsUseCase } from './application/get-doctor-slots.use-case';
import { ListAppointmentsUseCase } from './application/list-appointments.use-case';
import { ListMyScheduleTemplatesUseCase } from './application/list-my-schedule-templates.use-case';
import { ListScheduleTemplatesUseCase } from './application/list-schedule-templates.use-case';
import { ManageMyScheduleTemplatesUseCase } from './application/manage-my-schedule-templates.use-case';
import { RescheduleAppointmentUseCase } from './application/reschedule-appointment.use-case';
import { UpdateScheduleTemplateUseCase } from './application/update-schedule-template.use-case';
import { AppointmentRepository } from './infrastructure/appointment.repository';
import { AppointmentHoldRepository } from './infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from './infrastructure/appointment-slot.repository';
import { HoldExpiryJob } from './infrastructure/hold-expiry.job';
import { ScheduleTemplateRepository } from './infrastructure/schedule-template.repository';
import { SlotGenerationJob } from './infrastructure/slot-generation.job';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProviderDirectoryModule } from '../provider-directory/provider-directory.module';

/**
 * File 11 Part 03: owns `schedule_templates`, `appointment_slots`,
 * `appointment_holds`, `appointments` (File 12 Part 35 — hold/confirm/
 * cancel/reschedule/`GET` are all implemented now). Imports
 * `ProviderDirectoryModule` for the three use-cases it exports (Part 33.3/
 * 36.3) and `PaymentsModule` for pay-at-clinic capture/refund (Part 36) —
 * never reaches into either module's repositories.
 */
@Module({
  imports: [AuditModule, ProviderDirectoryModule, PaymentsModule],
  controllers: [ScheduleTemplatesController, DoctorScheduleTemplatesController, DoctorSlotsController, AppointmentsController],
  providers: [
    // infrastructure
    ScheduleTemplateRepository,
    AppointmentSlotRepository,
    AppointmentHoldRepository,
    AppointmentRepository,
    SlotGenerationJob,
    HoldExpiryJob,
    // application
    CreateScheduleTemplateUseCase,
    UpdateScheduleTemplateUseCase,
    DeleteScheduleTemplateUseCase,
    ListScheduleTemplatesUseCase,
    ListMyScheduleTemplatesUseCase,
    ManageMyScheduleTemplatesUseCase,
    GenerateSlotsUseCase,
    GetDoctorSlotsUseCase,
    CreateHoldUseCase,
    ConfirmAppointmentUseCase,
    CancelAppointmentUseCase,
    RescheduleAppointmentUseCase,
    ListAppointmentsUseCase,
    GetAppointmentUseCase,
    ExpireHoldsUseCase,
  ],
})
export class SchedulingAppointmentsModule {}
