import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { holdExpiresAt } from '../domain/appointment-lifecycle.rules';
import { translateCreateHoldError } from './create-hold.use-case';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentHoldRepository } from '../infrastructure/appointment-hold.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface RescheduleAppointmentInput {
  newSlotId: string;
}

export interface RescheduleAppointmentResult {
  holdId: string;
  slotId: string;
  expiresAt: Date;
  status: 'HELD';
  previousAppointmentId: string;
}

/**
 * File 10 §2.3 `POST /v1/appointments/{appointmentId}/reschedule` / File 12
 * Part 35.10-35.13: one transaction — release the old slot, claim the new
 * one, create a fresh `AppointmentHold` carrying `rescheduledFromAppointmentId`
 * (so `ConfirmAppointmentUseCase` can link the eventual new `Appointment`
 * back to this one, Part 35.13), mark the old appointment `RESCHEDULED`.
 * The patient still explicitly confirms the new hold — this does not
 * auto-confirm (Part 35.10).
 */
@Injectable()
export class RescheduleAppointmentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentRepository,
    private readonly slots: AppointmentSlotRepository,
    private readonly holds: AppointmentHoldRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(appointmentId: string, input: RescheduleAppointmentInput, actor: AccessTokenPayload): Promise<RescheduleAppointmentResult> {
    return this.prisma.$transaction(async (tx) => {
      const appointment = await this.appointments.findById(tx, appointmentId);
      if (!appointment || appointment.patient_id !== actor.sub) {
        throw new NotFoundError('Appointment', appointmentId);
      }
      if (appointment.status !== 'CONFIRMED') {
        throw new BusinessRuleError('APPOINTMENT_NOT_RESCHEDULABLE', 'Only a confirmed appointment can be rescheduled.', {
          status: appointment.status,
        });
      }

      const newSlot = await this.slots.findById(tx, input.newSlotId);
      if (!newSlot || newSlot.doctor_clinic_affiliation_id !== appointment.doctor_clinic_affiliation_id) {
        // File 12 Part 35.11: a different affiliation isn't a "reschedule" — existence-hiding 404, same pattern as CreateHoldUseCase.
        throw new NotFoundError('AppointmentSlot', input.newSlotId);
      }

      const rescheduled = await this.appointments.markRescheduled(tx, appointment.id, appointment.version);
      if (!rescheduled) {
        throw new ConflictError('APPOINTMENT_STATE_CHANGED', 'This appointment was modified concurrently. Reload and try again.', { appointmentId });
      }

      await this.slots.releaseBooked(tx, appointment.slot_id);

      const claimed = await this.slots.markHeld(tx, newSlot.id);
      if (!claimed) {
        throw new ConflictError('SLOT_ALREADY_BOOKED', 'This slot is no longer open.', { slotId: newSlot.id });
      }

      const expiresAt = holdExpiresAt(new Date());
      const hold = await this.holds
        .create(tx, { slotId: newSlot.id, patientId: actor.sub, expiresAt, rescheduledFromAppointmentId: appointment.id })
        .catch((error: unknown) => {
          throw translateCreateHoldError(error, newSlot.id);
        });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.reschedule',
        resourceType: 'appointment',
        resourceId: appointment.id,
      });

      await this.outbox.emit(tx, 'AppointmentHeld', {
        holdId: hold.id,
        slotId: newSlot.id,
        patientId: actor.sub,
        expiresAt: expiresAt.toISOString(),
        rescheduledFromAppointmentId: appointment.id,
      });

      return { holdId: hold.id, slotId: newSlot.id, expiresAt, status: 'HELD' as const, previousAppointmentId: appointment.id };
    });
  }
}
